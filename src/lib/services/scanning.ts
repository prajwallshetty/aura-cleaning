import "server-only";
import { prisma } from "@/lib/prisma";
import { num } from "@/lib/money";
import { parseScan } from "@/lib/codes";
import { ORDER_STATUS_LABELS, STAGE_LABELS } from "@/lib/workflow";
import { categoryMeta } from "@/lib/garment-categories";
import {
  MISMATCH_LABELS,
  detectMismatches,
  type MismatchKind,
} from "@/lib/services/garment-tracking";
import type { ScanSource, ScanTargetKind } from "@/generated/prisma/enums";

/** The order card the counter sees after a successful scan. */
export interface ScannedOrder {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  priority: string;
  branchId: string;
  branchName: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  placedAt: string;
  expectedDeliveryAt: string;
  isOverdue: boolean;
  totalPieces: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  rackLocation: string | null;
  specialInstructions: string | null;
  tagPrintCount: number;
  items: Array<{ id: string; label: string; quantity: number; lineTotal: number }>;
  stageSummary: Array<{ stage: string; label: string; done: number; total: number }>;
  /** Pieces of each kind on this order, and how many have been scanned here. */
  categories: Array<{
    category: string;
    label: string;
    emoji: string;
    expected: number;
    scanned: number;
  }>;
  /** Anything the mismatch engine has to say about this order's pieces. */
  issues: Array<{
    garmentId: string;
    garmentCode: string;
    kind: MismatchKind;
    label: string;
    detail: string;
  }>;
  /** Set when the code was a garment tag rather than the order tag. */
  scannedGarment: {
    code: string;
    typeName: string;
    serviceName: string;
    categoryLabel: string;
    status: string;
    slot: string | null;
  } | null;
}

export interface ScanOutcome {
  ok: boolean;
  kind: ScanTargetKind;
  message: string;
  order: ScannedOrder | null;
  /** Set when a garment was read against an order it does not belong to. */
  wrongOrder?: {
    garmentId: string;
    garmentCode: string;
    belongsToOrderId: string;
    belongsToOrderNumber: string;
  };
}

const CLOSED = new Set(["DELIVERED", "CANCELLED", "REFUNDED"]);

async function loadOrder(
  orderId: string,
  scannedGarmentCode: string | null,
): Promise<ScannedOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      branch: { select: { name: true } },
      rackSlot: { select: { code: true, rack: { select: { code: true } } } },
      items: {
        include: {
          service: { select: { name: true } },
          garmentType: { select: { name: true } },
        },
      },
      garments: {
        select: {
          id: true,
          garmentCode: true,
          status: true,
          currentStage: true,
          trackingCategory: true,
          garmentType: { select: { name: true } },
          service: { select: { name: true } },
          rackSlot: { select: { code: true, rack: { select: { code: true } } } },
          tasks: { select: { stage: true, status: true } },
          scans: {
            select: { stage: true, outcome: true },
          },
        },
      },
    },
  });

  if (!order) return null;

  // How far the order has actually got, station by station.
  const done = new Map<string, { done: number; total: number }>();
  for (const garment of order.garments) {
    for (const task of garment.tasks) {
      const entry = done.get(task.stage) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (["COMPLETED", "PASSED", "SKIPPED"].includes(task.status)) entry.done += 1;
      done.set(task.stage, entry);
    }
  }

  const scanned = scannedGarmentCode
    ? order.garments.find((garment) => garment.garmentCode === scannedGarmentCode)
    : undefined;

  // Expected vs actually-scanned, per category — the count an operator does by
  // hand when they open a bundle.
  const byCategory = new Map<string, { expected: number; scanned: number }>();
  for (const garment of order.garments) {
    const entry = byCategory.get(garment.trackingCategory) ?? { expected: 0, scanned: 0 };
    entry.expected += 1;
    if (
      garment.scans.some(
        (scan) => scan.stage === garment.currentStage && scan.outcome === "MATCH",
      )
    ) {
      entry.scanned += 1;
    }
    byCategory.set(garment.trackingCategory, entry);
  }

  const findings = await detectMismatches({ branchIds: [order.branchId] });
  const orderGarmentIds = new Set(order.garments.map((garment) => garment.id));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    paymentStatus: order.paymentStatus,
    priority: order.priority,
    branchId: order.branchId,
    branchName: order.branch.name,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    placedAt: order.placedAt.toISOString(),
    expectedDeliveryAt: order.expectedDeliveryAt.toISOString(),
    isOverdue: !CLOSED.has(order.status) && order.expectedDeliveryAt.getTime() < Date.now(),
    totalPieces: order.totalPieces,
    totalAmount: num(order.totalAmount),
    paidAmount: num(order.paidAmount),
    outstandingAmount: num(order.outstandingAmount),
    rackLocation: order.rackSlot
      ? `${order.rackSlot.rack.code}-${order.rackSlot.code}`
      : null,
    specialInstructions: order.specialInstructions,
    tagPrintCount: order.tagPrintCount,
    items: order.items.map((item) => ({
      id: item.id,
      label: `${item.garmentType.name} · ${item.service.name}`,
      quantity: item.quantity,
      lineTotal: num(item.lineTotal),
    })),
    stageSummary: [...done.entries()]
      .map(([stage, counts]) => ({
        stage,
        label: STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage,
        ...counts,
      }))
      .sort((a, b) => a.stage.localeCompare(b.stage)),
    categories: [...byCategory.entries()].map(([category, counts]) => {
      const meta = categoryMeta(category as never);
      return {
        category,
        label: meta.label,
        emoji: meta.emoji,
        expected: counts.expected,
        scanned: counts.scanned,
      };
    }),
    issues: findings
      .filter((finding) => orderGarmentIds.has(finding.garmentId))
      .map((finding) => ({
        garmentId: finding.garmentId,
        garmentCode: finding.garmentCode,
        kind: finding.kind,
        label: MISMATCH_LABELS[finding.kind],
        detail: finding.detail,
      })),
    scannedGarment: scanned
      ? {
          code: scanned.garmentCode,
          typeName: scanned.garmentType.name,
          serviceName: scanned.service.name,
          categoryLabel: categoryMeta(scanned.trackingCategory).label,
          status: scanned.status,
          slot: scanned.rackSlot
            ? `${scanned.rackSlot.rack.code}-${scanned.rackSlot.code}`
            : null,
        }
      : null,
  };
}

/**
 * Resolves whatever came off the scanner to the order behind it.
 *
 * Order tags, garment tags, plain order numbers and plain garment codes all
 * land on the same order card — scanning the same tag twice reopens the order
 * that is already there rather than starting anything new, which is what keeps
 * a jumpy scanner from creating duplicates.
 */
export async function resolveScan(
  rawCode: string,
  contextOrderId?: string | null,
): Promise<ScanOutcome> {
  const code = rawCode.trim();
  if (!code) {
    return { ok: false, kind: "UNKNOWN", message: "Nothing was scanned", order: null };
  }

  const parsed = parseScan(code);

  if (parsed.kind === "order") {
    const order = await prisma.order.findUnique({
      where: { orderNumber: parsed.value },
      select: { id: true },
    });
    if (!order) {
      return {
        ok: false,
        kind: "ORDER",
        message: `No order matches ${parsed.value}. Check the tag and scan again.`,
        order: null,
      };
    }
    return {
      ok: true,
      kind: "ORDER",
      message: `Order ${parsed.value}`,
      order: await loadOrder(order.id, null),
    };
  }

  if (parsed.kind === "garment" || parsed.kind === "unknown") {
    const garment = await prisma.garment.findFirst({
      where: {
        OR: [
          { garmentCode: parsed.value },
          { barcodeValue: parsed.value },
          { qrPayload: code },
        ],
      },
      select: {
        id: true,
        garmentCode: true,
        orderId: true,
        trackingCategory: true,
        currentStage: true,
        branchId: true,
        order: { select: { orderNumber: true } },
      },
    });

    if (garment) {
      // The counter had an order open and this piece is not on it — the exact
      // case the mismatch engine exists to catch, so say so rather than
      // quietly swapping the card for a different order.
      if (contextOrderId && contextOrderId !== garment.orderId) {
        const context = await prisma.order.findUnique({
          where: { id: contextOrderId },
          select: { orderNumber: true },
        });
        return {
          ok: false,
          kind: "GARMENT",
          message: `${garment.garmentCode} belongs to ${garment.order.orderNumber}, not ${context?.orderNumber ?? "the order on screen"}.`,
          order: null,
          wrongOrder: {
            garmentId: garment.id,
            garmentCode: garment.garmentCode,
            belongsToOrderId: garment.orderId,
            belongsToOrderNumber: garment.order.orderNumber,
          },
        };
      }

      return {
        ok: true,
        kind: "GARMENT",
        message: `Garment ${garment.garmentCode}`,
        order: await loadOrder(garment.orderId, garment.garmentCode),
      };
    }

    // Someone may have typed an order number without its prefix.
    const fallback = await prisma.order.findFirst({
      where: { orderNumber: { equals: parsed.value, mode: "insensitive" } },
      select: { id: true, orderNumber: true },
    });
    if (fallback) {
      return {
        ok: true,
        kind: "ORDER",
        message: `Order ${fallback.orderNumber}`,
        order: await loadOrder(fallback.id, null),
      };
    }
  }

  if (parsed.kind === "slot") {
    return {
      ok: false,
      kind: "SLOT",
      message: `${parsed.value} is a rack slot, not an order tag. Scan the tag on the bundle.`,
      order: null,
    };
  }

  return {
    ok: false,
    kind: "UNKNOWN",
    message: `"${code}" is not a tag this system issued. Try again, or search for the order.`,
    order: null,
  };
}

export async function logScan(params: {
  branchId: string;
  rawCode: string;
  outcome: ScanOutcome;
  source: ScanSource;
  userId: string;
  action?: string | null;
}): Promise<void> {
  await prisma.scanEvent.create({
    data: {
      branchId: params.outcome.order?.branchId ?? params.branchId,
      rawCode: params.rawCode.slice(0, 200),
      resolvedAs: params.outcome.kind,
      orderId: params.outcome.order?.id ?? null,
      garmentCode: params.outcome.order?.scannedGarment?.code ?? null,
      succeeded: params.outcome.ok,
      message: params.outcome.message,
      source: params.source,
      action: params.action ?? null,
      scannedById: params.userId,
    },
  });
}

export interface ScanHistoryRow {
  id: string;
  rawCode: string;
  resolvedAs: string;
  succeeded: boolean;
  message: string | null;
  action: string | null;
  source: string;
  scannedAt: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  garmentCode: string | null;
  scannedBy: string | null;
}

export async function listScanHistory(params: {
  branchIds: string[] | null;
  limit?: number;
  onlyFailures?: boolean;
  search?: string;
}): Promise<ScanHistoryRow[]> {
  const search = params.search?.trim();
  const rows = await prisma.scanEvent.findMany({
    where: {
      ...(params.branchIds ? { branchId: { in: params.branchIds } } : {}),
      ...(params.onlyFailures ? { succeeded: false } : {}),
      ...(search
        ? {
            OR: [
              { rawCode: { contains: search, mode: "insensitive" } },
              { garmentCode: { contains: search, mode: "insensitive" } },
              { order: { orderNumber: { contains: search, mode: "insensitive" } } },
              { order: { customerName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { scannedAt: "desc" },
    take: params.limit ?? 40,
    include: {
      order: { select: { orderNumber: true, customerName: true } },
      scannedBy: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    rawCode: row.rawCode,
    resolvedAs: row.resolvedAs,
    succeeded: row.succeeded,
    message: row.message,
    action: row.action,
    source: row.source,
    scannedAt: row.scannedAt.toISOString(),
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
    customerName: row.order?.customerName ?? null,
    garmentCode: row.garmentCode,
    scannedBy: row.scannedBy?.name ?? null,
  }));
}
