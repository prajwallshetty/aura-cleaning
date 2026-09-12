"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { revalidateOperational } from "@/lib/revalidate";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validations/common";
import {
  assertBranchAccess,
  authorize,
  requireWriteBranch,
} from "@/lib/session";
import {
  BusinessRuleError,
  NotFoundError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { moveGarmentToSlot } from "@/lib/services/garments";
import {
  generateSlotsSchema,
  rackSchema,
  releaseSlotSchema,
  slotSchema,
} from "@/lib/validations/rack";

export async function saveRackAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.RACK_MANAGE);
    const input = rackSchema.parse(payload);
    const branchId = requireWriteBranch(user, input.branchId);

    const rack = input.id
      ? await (async () => {
          const existing = await prisma.rack.findUnique({
            where: { id: input.id },
            select: { id: true, branchId: true },
          });
          if (!existing) throw new NotFoundError("Rack not found");
          assertBranchAccess(user, existing.branchId);
          return prisma.rack.update({
            where: { id: input.id },
            data: {
              code: input.code,
              name: input.name,
              description: input.description ?? null,
              isActive: input.isActive,
            },
          });
        })()
      : await prisma.rack.create({
          data: {
            branchId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            isActive: input.isActive,
          },
        });

    await recordAudit({
      userId: user.id,
      branchId,
      action: input.id ? "RACK_UPDATED" : "RACK_CREATED",
      entity: "Rack",
      entityId: rack.id,
      summary: `Rack ${rack.code} — ${rack.name}`,
    });

    revalidateOperational();
    return { id: rack.id };
  });
}

export async function saveSlotAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.RACK_MANAGE);
    const input = slotSchema.parse(payload);

    const rack = await prisma.rack.findUnique({
      where: { id: input.rackId },
      select: { id: true, branchId: true, code: true },
    });
    if (!rack) throw new NotFoundError("Rack not found");
    assertBranchAccess(user, rack.branchId);

    const slot = input.id
      ? await prisma.rackSlot.update({
          where: { id: input.id },
          data: {
            code: input.code,
            label: input.label ?? null,
            capacity: input.capacity,
            isActive: input.isActive,
          },
        })
      : await prisma.rackSlot.create({
          data: {
            rackId: rack.id,
            code: input.code,
            label: input.label ?? null,
            capacity: input.capacity,
            isActive: input.isActive,
          },
        });

    await recordAudit({
      userId: user.id,
      branchId: rack.branchId,
      action: input.id ? "RACK_SLOT_UPDATED" : "RACK_SLOT_CREATED",
      entity: "RackSlot",
      entityId: slot.id,
      summary: `Slot ${rack.code} · ${slot.code}`,
    });

    revalidateOperational([`/racks/${rack.id}`]);
    return { id: slot.id };
  });
}

/** Creates A01…A20 style slots for a rack in one operation. */
export async function generateSlotsAction(
  payload: unknown,
): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.RACK_MANAGE);
    const input = generateSlotsSchema.parse(payload);

    const rack = await prisma.rack.findUnique({
      where: { id: input.rackId },
      select: { id: true, branchId: true, code: true },
    });
    if (!rack) throw new NotFoundError("Rack not found");
    assertBranchAccess(user, rack.branchId);

    const codes = Array.from({ length: input.count }, (_, index) => {
      const number = input.startAt + index;
      return `${rack.code}${String(number).padStart(2, "0")}`;
    });

    const result = await prisma.rackSlot.createMany({
      data: codes.map((code) => ({
        rackId: rack.id,
        code,
        capacity: input.capacity,
      })),
      skipDuplicates: true,
    });

    await recordAudit({
      userId: user.id,
      branchId: rack.branchId,
      action: "RACK_SLOTS_GENERATED",
      entity: "Rack",
      entityId: rack.id,
      summary: `Generated ${result.count} slots on rack ${rack.code}`,
    });

    revalidatePath(`/racks/${rack.id}`);
    return { created: result.count };
  });
}

/** Takes garments off a slot — used when an order is handed over. */
export async function releaseGarmentsAction(
  payload: unknown,
): Promise<ActionResult<{ released: number }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.RACK_ASSIGN);
    const input = releaseSlotSchema.parse(payload);
    if (!user.branchId) throw new BusinessRuleError("Your account is not assigned to a branch");

    const released = await prisma.$transaction(async (tx) => {
      const garments = await tx.garment.findMany({
        where: { id: { in: input.garmentIds } },
        select: { id: true, rackSlotId: true, branchId: true },
      });

      let count = 0;
      for (const garment of garments) {
        if (!garment.rackSlotId) continue;
        assertBranchAccess(user, garment.branchId);
        await moveGarmentToSlot(tx, {
          garmentId: garment.id,
          fromSlotId: garment.rackSlotId,
          toSlotId: null,
          actor: { userId: user.id, userName: user.name, branchId: user.branchId! },
          note: input.note ?? "Removed from rack",
        });
        count += 1;
      }
      return count;
    });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "GARMENTS_RELEASED",
      entity: "RackSlot",
      summary: `${released} garments removed from racks`,
    });

    revalidateOperational();
    return { released };
  });
}

export async function deleteRackAction(rackId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.RACK_MANAGE);

    const rack = await prisma.rack.findUnique({
      where: { id: rackId },
      select: {
        id: true,
        branchId: true,
        code: true,
        slots: { select: { _count: { select: { garments: true } } } },
      },
    });
    if (!rack) throw new NotFoundError("Rack not found");
    assertBranchAccess(user, rack.branchId);

    const occupied = rack.slots.reduce((sum, slot) => sum + slot._count.garments, 0);
    if (occupied > 0) {
      throw new BusinessRuleError(
        `Rack ${rack.code} still holds ${occupied} garments — clear it first`,
      );
    }

    await prisma.rack.delete({ where: { id: rackId } });

    await recordAudit({
      userId: user.id,
      branchId: rack.branchId,
      action: "RACK_DELETED",
      entity: "Rack",
      entityId: rackId,
      summary: `Deleted rack ${rack.code}`,
    });

    revalidateOperational();
    return null;
  });
}


/**
 * Taking a slot out of service. A slot holding garments cannot be removed —
 * empty it first — and one that has ever held anything is deactivated rather
 * than deleted so its location history still resolves.
 */
export async function deleteSlotAction(
  payload: unknown,
): Promise<ActionResult<{ deleted: boolean }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.RACK_MANAGE);
    const { id } = z.object({ id: cuidSchema }).parse(payload);

    const slot = await prisma.rackSlot.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        isActive: true,
        rack: { select: { id: true, code: true, branchId: true } },
        _count: { select: { garments: true, historyFrom: true, historyTo: true } },
      },
    });
    if (!slot) throw new NotFoundError("Slot not found");
    assertBranchAccess(user, slot.rack.branchId);

    if (slot._count.garments > 0) {
      throw new BusinessRuleError(
        `${slot.rack.code}-${slot.code} still holds ${slot._count.garments} garment${slot._count.garments === 1 ? "" : "s"} — move them first`,
      );
    }

    const hasHistory = slot._count.historyFrom + slot._count.historyTo > 0;

    if (hasHistory) {
      if (!slot.isActive) {
        throw new BusinessRuleError(`${slot.rack.code}-${slot.code} is already out of service`);
      }
      await prisma.rackSlot.update({ where: { id }, data: { isActive: false } });
      await recordAudit({
        userId: user.id,
        branchId: slot.rack.branchId,
        action: "SLOT_DEACTIVATED",
        entity: "RackSlot",
        entityId: id,
        summary: `${slot.rack.code}-${slot.code} taken out of service`,
      });
      revalidatePath(`/racks/${slot.rack.id}`);
      return { deleted: false };
    }

    await prisma.rackSlot.delete({ where: { id } });
    await recordAudit({
      userId: user.id,
      branchId: slot.rack.branchId,
      action: "SLOT_DELETED",
      entity: "RackSlot",
      entityId: id,
      summary: `${slot.rack.code}-${slot.code} removed`,
    });
    revalidatePath(`/racks/${slot.rack.id}`);
    return { deleted: true };
  });
}
