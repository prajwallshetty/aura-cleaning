"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PERMISSIONS, STAGE_PERMISSION } from "@/lib/rbac";
import {
  assertBranchAccess,
  authorize,
  hasPermission,
} from "@/lib/session";
import {
  BusinessRuleError,
  NotFoundError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { parseScan } from "@/lib/codes";
import { categoryLabel } from "@/lib/garment-categories";
import { advanceGarment, advanceMany } from "@/lib/services/processing";
import { moveGarmentToSlot, recomputeOrderStatus } from "@/lib/services/garments";
import {
  assertUploadAllowed,
  getStorageProvider,
} from "@/lib/providers/storage";
import {
  advanceStageSchema,
  assignSlotSchema,
  bulkAdvanceSchema,
  garmentUpdateSchema,
  markGarmentSchema,
  scanSchema,
} from "@/lib/validations/garment";
import { formatDateTime } from "@/lib/dates";
import { GARMENT_STATUS_LABELS, STAGE_LABELS } from "@/lib/workflow";

export interface ScanResult {
  kind: "garment" | "order";
  garment?: {
    id: string;
    garmentCode: string;
    orderId: string;
    orderNumber: string;
    customerName: string;
    typeName: string;
    serviceName: string;
    status: string;
    statusLabel: string;
    stage: string;
    stageLabel: string;
    location: string | null;
    lastScannedAt: string | null;
    lastScannedBy: string | null;
    stainNotes: string | null;
    damageNotes: string | null;
    history: {
      id: string;
      at: string;
      status: string;
      stage: string;
      user: string | null;
      note: string | null;
    }[];
    pendingStage: string | null;
  };
  order?: { id: string; orderNumber: string; status: string };
}

/**
 * Resolves a scanned or typed code. This is the "where is G1001 right now?"
 * endpoint — it answers with the garment's location, stage and full history.
 */
export async function lookupCodeAction(
  payload: unknown,
): Promise<ActionResult<ScanResult>> {
  return runAction(async () => {
    const user = await authorize([PERMISSIONS.GARMENT_SCAN, PERMISSIONS.GARMENT_VIEW]);

    const limit = rateLimit(
      `scan:${user.id}`,
      RATE_LIMITS.SCAN.limit,
      RATE_LIMITS.SCAN.windowMs,
    );
    if (!limit.success) throw new BusinessRuleError("Scanning too fast — slow down a moment");

    const { code } = scanSchema.parse(payload);
    const parsed = parseScan(code);

    if (parsed.kind === "order") {
      const order = await prisma.order.findUnique({
        where: { orderNumber: parsed.value },
        select: { id: true, orderNumber: true, status: true, branchId: true },
      });
      if (!order) throw new NotFoundError(`No order matches ${parsed.value}`);
      assertBranchAccess(user, order.branchId);
      return {
        kind: "order" as const,
        order: { id: order.id, orderNumber: order.orderNumber, status: order.status },
      };
    }

    const garment = await prisma.garment.findFirst({
      where:
        parsed.kind === "garment"
          ? { garmentCode: parsed.value }
          : { OR: [{ garmentCode: parsed.value }, { barcodeValue: parsed.value }, { qrPayload: code.trim() }] },
      include: {
        order: { select: { id: true, orderNumber: true, customerName: true } },
        garmentType: { select: { name: true } },
        service: { select: { name: true } },
        rackSlot: { select: { code: true, rack: { select: { code: true, name: true } } } },
        lastScannedBy: { select: { name: true } },
        tasks: { orderBy: { sequence: "asc" } },
        statusHistory: { orderBy: { createdAt: "desc" }, take: 40 },
      },
    });

    if (!garment) throw new NotFoundError(`No garment matches "${code}"`);
    assertBranchAccess(user, garment.branchId);

    const pending = garment.tasks.find((task) =>
      ["PENDING", "IN_PROGRESS"].includes(task.status),
    );

    return {
      kind: "garment" as const,
      garment: {
        id: garment.id,
        garmentCode: garment.garmentCode,
        orderId: garment.order.id,
        orderNumber: garment.order.orderNumber,
        customerName: garment.order.customerName,
        typeName: garment.garmentType.name,
        serviceName: garment.service.name,
        status: garment.status,
        statusLabel: GARMENT_STATUS_LABELS[garment.status],
        stage: garment.currentStage,
        stageLabel: STAGE_LABELS[garment.currentStage],
        location: garment.rackSlot
          ? `Rack ${garment.rackSlot.rack.code} · Slot ${garment.rackSlot.code}`
          : null,
        lastScannedAt: garment.lastScannedAt
          ? formatDateTime(garment.lastScannedAt)
          : null,
        lastScannedBy: garment.lastScannedBy?.name ?? null,
        stainNotes: garment.stainNotes,
        damageNotes: garment.damageNotes,
        history: garment.statusHistory.map((entry) => ({
          id: entry.id,
          at: entry.createdAt.toISOString(),
          status: entry.toStatus,
          stage: entry.stage,
          user: entry.userName,
          note: entry.note,
        })),
        pendingStage: pending?.stage ?? null,
      },
    };
  });
}

export async function advanceGarmentAction(
  payload: unknown,
): Promise<
  ActionResult<{
    garmentCode: string;
    status: string;
    nextStage: string | null;
    mismatchAlert: string | null;
  }>
> {
  return runAction(async () => {
    const input = advanceStageSchema.parse(payload);
    const required = STAGE_PERMISSION[input.stage] ?? PERMISSIONS.PROCESSING_VIEW;
    const user = await authorize(required);

    if (!user.branchId) {
      throw new BusinessRuleError("Your account is not assigned to a branch");
    }

    const result = await advanceGarment({
      garmentId: input.garmentId,
      stage: input.stage,
      outcome: input.outcome,
      note: input.note ?? null,
      scannedVia: input.scannedVia ?? "manual",
      rackSlotId: input.rackSlotId ?? null,
      contextOrderId: input.contextOrderId ?? null,
      actor: { userId: user.id, userName: user.name, branchId: user.branchId },
    });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "GARMENT_STAGE_ADVANCED",
      entity: "Garment",
      entityId: input.garmentId,
      summary: `${result.garmentCode} → ${result.status} at ${input.stage}`,
      after: { stage: input.stage, outcome: input.outcome, note: input.note },
    });

    revalidatePath("/processing");
    revalidatePath(`/garments/${result.garmentCode}`);
    revalidatePath("/dashboard");

    if (result.mismatchAlert) {
      revalidatePath("/mismatch");
    }

    return {
      garmentCode: result.garmentCode,
      status: result.status,
      nextStage: result.nextStage,
      mismatchAlert: result.mismatchAlert,
    };
  });
}

export async function bulkAdvanceAction(
  payload: unknown,
): Promise<ActionResult<{ succeeded: number; failed: { garmentId: string; error: string }[] }>> {
  return runAction(async () => {
    const input = bulkAdvanceSchema.parse(payload);
    const required = STAGE_PERMISSION[input.stage] ?? PERMISSIONS.PROCESSING_VIEW;
    const user = await authorize(required);

    if (!user.branchId) {
      throw new BusinessRuleError("Your account is not assigned to a branch");
    }
    if (input.garmentIds.length > 300) {
      throw new BusinessRuleError("Process at most 300 garments at a time");
    }

    const { succeeded, failed } = await advanceMany(input.garmentIds, {
      stage: input.stage,
      outcome: input.outcome,
      note: input.note ?? null,
      scannedVia: "bulk",
      rackSlotId: input.rackSlotId ?? null,
      actor: { userId: user.id, userName: user.name, branchId: user.branchId },
    });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "GARMENT_BULK_ADVANCED",
      entity: "ProcessingTask",
      summary: `${succeeded.length} garments → ${input.outcome} at ${input.stage}${failed.length ? ` (${failed.length} failed)` : ""}`,
    });

    revalidatePath("/processing");
    revalidatePath("/dashboard");

    return { succeeded: succeeded.length, failed };
  });
}

export async function updateGarmentAction(payload: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.GARMENT_UPDATE);
    const input = garmentUpdateSchema.parse(payload);

    const garment = await prisma.garment.findUnique({
      where: { id: input.garmentId },
      select: { id: true, branchId: true, garmentCode: true },
    });
    if (!garment) throw new NotFoundError("Garment not found");
    assertBranchAccess(user, garment.branchId);

    await prisma.garment.update({
      where: { id: garment.id },
      data: {
        color: input.color ?? null,
        brand: input.brand ?? null,
        size: input.size ?? null,
        fabric: input.fabric ?? null,
        stainNotes: input.stainNotes ?? null,
        damageNotes: input.damageNotes ?? null,
      },
    });

    await recordAudit({
      userId: user.id,
      branchId: garment.branchId,
      action: "GARMENT_UPDATED",
      entity: "Garment",
      entityId: garment.id,
      summary: `Updated details for ${garment.garmentCode}`,
      after: input,
    });

    revalidatePath(`/garments/${garment.garmentCode}`);
    return null;
  });
}

/** Flags a garment as lost, damaged or returned — always with a reason. */
export async function markGarmentAction(payload: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.GARMENT_UPDATE);
    const input = markGarmentSchema.parse(payload);

    const garment = await prisma.garment.findUnique({
      where: { id: input.garmentId },
      select: { id: true, branchId: true, garmentCode: true, status: true, orderId: true },
    });
    if (!garment) throw new NotFoundError("Garment not found");
    assertBranchAccess(user, garment.branchId);

    await prisma.$transaction(async (tx) => {
      await tx.garment.update({
        where: { id: garment.id },
        data: { status: input.status },
      });
      await tx.garmentStatusHistory.create({
        data: {
          garmentId: garment.id,
          fromStatus: garment.status,
          toStatus: input.status,
          stage: "DISPATCH",
          branchId: garment.branchId,
          userId: user.id,
          userName: user.name,
          note: input.note,
        },
      });
      await tx.processingTask.updateMany({
        where: { garmentId: garment.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
        data: { status: "SKIPPED" },
      });
      await recomputeOrderStatus(tx, garment.orderId, {
        userId: user.id,
        userName: user.name,
        branchId: garment.branchId,
      });
    });

    await recordAudit({
      userId: user.id,
      branchId: garment.branchId,
      action: `GARMENT_MARKED_${input.status}`,
      entity: "Garment",
      entityId: garment.id,
      summary: `${garment.garmentCode} marked ${input.status.toLowerCase()}: ${input.note}`,
    });

    revalidatePath(`/garments/${garment.garmentCode}`);
    revalidatePath("/dashboard");
    return null;
  });
}

/** Files garments (or a whole order) onto a rack slot. */
export async function assignSlotAction(payload: unknown): Promise<ActionResult<{ moved: number }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.RACK_ASSIGN);
    const input = assignSlotSchema.parse(payload);

    if (!user.branchId) throw new BusinessRuleError("Your account is not assigned to a branch");

    const slot = await prisma.rackSlot.findUnique({
      where: { id: input.rackSlotId },
      include: { rack: { select: { branchId: true, code: true } }, _count: { select: { garments: true } } },
    });
    if (!slot) throw new NotFoundError("Rack slot not found");
    assertBranchAccess(user, slot.rack.branchId);
    if (!slot.isActive) throw new BusinessRuleError("That slot is out of service");

    const garmentIds =
      input.garmentIds && input.garmentIds.length > 0
        ? input.garmentIds
        : input.orderId
          ? (
              await prisma.garment.findMany({
                where: {
                  orderId: input.orderId,
                  status: { notIn: ["DELIVERED", "LOST"] },
                },
                select: { id: true },
              })
            ).map((garment) => garment.id)
          : [];

    if (garmentIds.length === 0) {
      throw new BusinessRuleError("Select at least one garment to file");
    }

    if (slot._count.garments + garmentIds.length > slot.capacity) {
      throw new BusinessRuleError(
        `Slot ${slot.code} holds ${slot.capacity} garments and already has ${slot._count.garments}`,
      );
    }

    const moved = await prisma.$transaction(async (tx) => {
      const garments = await tx.garment.findMany({
        where: { id: { in: garmentIds } },
        select: { id: true, rackSlotId: true, branchId: true, status: true, orderId: true },
      });

      let count = 0;
      const orderIds = new Set<string>();

      for (const garment of garments) {
        if (garment.branchId !== slot.rack.branchId) continue;

        await moveGarmentToSlot(tx, {
          garmentId: garment.id,
          fromSlotId: garment.rackSlotId,
          toSlotId: slot.id,
          actor: { userId: user.id, userName: user.name, branchId: user.branchId! },
          note: input.note ?? "Filed to slot",
        });

        if (["PACKED", "QC_PASSED", "PACKING"].includes(garment.status)) {
          await tx.garment.update({
            where: { id: garment.id },
            data: { status: "READY" },
          });
          await tx.garmentStatusHistory.create({
            data: {
              garmentId: garment.id,
              fromStatus: garment.status,
              toStatus: "READY",
              stage: "PACKING",
              branchId: user.branchId!,
              userId: user.id,
              userName: user.name,
              note: `Filed to ${slot.rack.code} · ${slot.code}`,
            },
          });
        }

        orderIds.add(garment.orderId);
        count += 1;
      }

      for (const orderId of orderIds) {
        await recomputeOrderStatus(tx, orderId, {
          userId: user.id,
          userName: user.name,
          branchId: user.branchId!,
        });
        // Keep the order header's own slot pointer in step with its garments.
        await tx.order.update({
          where: { id: orderId },
          data: { rackSlotId: slot.id },
        });
      }

      return count;
    });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "GARMENTS_FILED",
      entity: "RackSlot",
      entityId: slot.id,
      summary: `${moved} garments filed to ${slot.rack.code} · ${slot.code}`,
    });

    revalidatePath("/racks");
    revalidatePath("/orders");
    return { moved };
  });
}

/** Uploads an intake or damage photo to object storage. */
export async function uploadGarmentPhotoAction(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.GARMENT_PHOTO_UPLOAD);

    const limit = rateLimit(
      `upload:${user.id}`,
      RATE_LIMITS.UPLOAD.limit,
      RATE_LIMITS.UPLOAD.windowMs,
    );
    if (!limit.success) throw new BusinessRuleError("Too many uploads — try again shortly");

    const garmentId = String(formData.get("garmentId") ?? "");
    const kind = String(formData.get("kind") ?? "INTAKE");
    const caption = String(formData.get("caption") ?? "").slice(0, 200);
    const file = formData.get("file");

    if (!(file instanceof File)) throw new BusinessRuleError("Choose an image to upload");
    assertUploadAllowed({ type: file.type, size: file.size });

    const garment = await prisma.garment.findUnique({
      where: { id: garmentId },
      select: { id: true, branchId: true, garmentCode: true },
    });
    if (!garment) throw new NotFoundError("Garment not found");
    assertBranchAccess(user, garment.branchId);

    const stored = await getStorageProvider().upload({
      body: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      originalName: file.name,
      folder: `garments/${garment.garmentCode}`,
    });

    await prisma.garmentPhoto.create({
      data: {
        garmentId: garment.id,
        url: stored.url,
        storageKey: stored.key,
        mimeType: stored.mimeType,
        sizeBytes: stored.size,
        kind: kind === "DAMAGE" ? "DAMAGE" : kind === "OUTBOUND" ? "OUTBOUND" : "INTAKE",
        caption: caption || null,
        uploadedById: user.id,
      },
    });

    await recordAudit({
      userId: user.id,
      branchId: garment.branchId,
      action: "GARMENT_PHOTO_UPLOADED",
      entity: "Garment",
      entityId: garment.id,
      summary: `Photo added to ${garment.garmentCode}`,
    });

    revalidatePath(`/garments/${garment.garmentCode}`);
    return { url: stored.url };
  });
}

/** Used by workstation screens to confirm a scanned garment belongs there. */
export async function scanForStageAction(
  code: string,
  stage: string,
  contextOrderNumber?: string | null,
): Promise<
  ActionResult<{
    id: string;
    garmentCode: string;
    orderNumber: string;
    typeName: string;
    categoryLabel: string;
    taskStatus: string;
    mismatchAlert: string | null;
  }>
> {
  return runAction(async () => {
    const required = STAGE_PERMISSION[stage] ?? PERMISSIONS.PROCESSING_VIEW;
    const user = await authorize(required);

    const parsed = parseScan(code);
    if (parsed.kind !== "garment") {
      throw new BusinessRuleError("That is not a garment code");
    }

    const garment = await prisma.garment.findUnique({
      where: { garmentCode: parsed.value },
      include: {
        order: { select: { orderNumber: true } },
        garmentType: { select: { name: true } },
        tasks: true,
      },
    });

    if (!garment) throw new NotFoundError(`No garment matches ${parsed.value}`);
    assertBranchAccess(user, garment.branchId);

    const task = garment.tasks.find((t) => t.stage === stage);
    if (!task) {
      throw new BusinessRuleError(
        `${garment.garmentCode} does not pass through this station`,
      );
    }
    if (["COMPLETED", "PASSED"].includes(task.status)) {
      throw new BusinessRuleError(
        `${garment.garmentCode} has already cleared this station`,
      );
    }

    // The operator finds out now, while the piece is still in their hand.
    let mismatchAlert: string | null = null;
    if (
      contextOrderNumber &&
      contextOrderNumber.toUpperCase() !== garment.order.orderNumber.toUpperCase()
    ) {
      mismatchAlert = `${garment.garmentCode} belongs to ${garment.order.orderNumber}, not ${contextOrderNumber.toUpperCase()}.`;
    } else {
      const alreadyHere = await prisma.garmentScan.findFirst({
        where: {
          garmentId: garment.id,
          stage: stage as never,
          outcome: "MATCH",
          scannedAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (alreadyHere) {
        mismatchAlert = `${garment.garmentCode} was already scanned into this station a moment ago.`;
      }
    }

    return {
      id: garment.id,
      garmentCode: garment.garmentCode,
      orderNumber: garment.order.orderNumber,
      typeName: garment.garmentType.name,
      categoryLabel: categoryLabel(garment.trackingCategory),
      taskStatus: task.status,
      mismatchAlert,
    };
  });
}
