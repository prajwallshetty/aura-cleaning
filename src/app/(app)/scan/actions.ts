"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/rbac";
import { assertBranchAccess, authorize, hasPermission } from "@/lib/session";
import {
  BusinessRuleError,
  NotFoundError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { formatCurrency, num, round2 } from "@/lib/money";
import { nextPaymentNumber } from "@/lib/sequence";
import { recalcOrderPayments, setOrderStatus } from "@/lib/services/orders";
import { canTransition } from "@/lib/workflow";
import {
  listScanHistory,
  logScan,
  resolveScan,
  type ScanHistoryRow,
  type ScanOutcome,
} from "@/lib/services/scanning";
import { paymentMethodSchema } from "@/lib/validations/billing";
import { cuidSchema } from "@/lib/validations/common";

const scanSchema = z.object({
  code: z.string().trim().min(1, "Scan or type a tag").max(200),
  source: z.enum(["KEYBOARD", "CAMERA", "HARDWARE"]).default("KEYBOARD"),
  /** The order already on the card, so a stray piece is caught. */
  contextOrderId: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
});

/**
 * The scan endpoint behind the counter's Scan Tag button.
 *
 * Every attempt is logged — including the ones that fail — because "the tag
 * would not scan" is a real support question and the history is the answer.
 */
export async function scanTagAction(payload: unknown): Promise<ActionResult<ScanOutcome>> {
  return runAction(async () => {
    const user = await authorize([PERMISSIONS.GARMENT_SCAN, PERMISSIONS.ORDER_VIEW]);

    const limit = rateLimit(
      `tagscan:${user.id}`,
      RATE_LIMITS.SCAN.limit,
      RATE_LIMITS.SCAN.windowMs,
    );
    if (!limit.success) throw new BusinessRuleError("Scanning too fast — slow down a moment");

    const input = scanSchema.parse(payload);
    const outcome = await resolveScan(input.code, input.contextOrderId ?? null);

    // A piece read against the wrong order goes on the garment ledger, not
    // only the scan log — that is what puts it in the mismatch centre.
    if (outcome.wrongOrder && input.contextOrderId) {
      const garment = await prisma.garment.findUnique({
        where: { id: outcome.wrongOrder.garmentId },
        select: { branchId: true, trackingCategory: true, currentStage: true },
      });
      if (garment) {
        try {
          assertBranchAccess(user, garment.branchId);
          await prisma.garmentScan.create({
            data: {
              garmentId: outcome.wrongOrder.garmentId,
              orderId: outcome.wrongOrder.belongsToOrderId,
              contextOrderId: input.contextOrderId,
              branchId: garment.branchId,
              trackingCategory: garment.trackingCategory,
              stage: garment.currentStage,
              outcome: "WRONG_ORDER",
              note: "Read against another order at the counter",
              scannedById: user.id,
            },
          });
          revalidatePath("/mismatch");
          revalidatePath("/tracking");
        } catch {
          // A cross-branch tag is refused below; nothing to log here.
        }
      }
    }

    // A tag from another branch resolves, but this user may not open it.
    if (outcome.order) {
      try {
        assertBranchAccess(user, outcome.order.branchId);
      } catch {
        const denied: ScanOutcome = {
          ok: false,
          kind: outcome.kind,
          message: `${outcome.order.orderNumber} belongs to ${outcome.order.branchName}, which you do not have access to.`,
          order: null,
        };
        await logScan({
          branchId: user.branchId ?? outcome.order.branchId,
          rawCode: input.code,
          outcome: denied,
          source: input.source,
          userId: user.id,
        });
        return denied;
      }
    }

    await logScan({
      branchId: user.branchId ?? outcome.order?.branchId ?? "",
      rawCode: input.code,
      outcome,
      source: input.source,
      userId: user.id,
    });

    return outcome;
  });
}

export async function scanHistoryAction(
  payload: unknown,
): Promise<ActionResult<ScanHistoryRow[]>> {
  return runAction(async () => {
    const user = await authorize([PERMISSIONS.GARMENT_SCAN, PERMISSIONS.ORDER_VIEW]);
    const input = z
      .object({
        search: z.string().trim().max(120).optional(),
        onlyFailures: z.boolean().default(false),
      })
      .parse(payload ?? {});

    return listScanHistory({
      branchIds: hasPermission(user, PERMISSIONS.DASHBOARD_VIEW_ALL_BRANCHES)
        ? null
        : user.branchId
          ? [user.branchId]
          : [],
      search: input.search,
      onlyFailures: input.onlyFailures,
      limit: 60,
    });
  });
}

const quickStatusSchema = z.object({
  orderId: cuidSchema,
  status: z.enum([
    "RECEIVED",
    "WASHING",
    "DRYING",
    "IRONING",
    "PACKING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "ON_HOLD",
  ]),
});

/**
 * One-tap status change from the scan card. Deliberately narrower than the
 * full order screen: the shop floor only ever moves an order forward along the
 * counter flow, and the transition table still has the final say.
 */
export async function scanStatusAction(
  payload: unknown,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.ORDER_UPDATE);
    const input = quickStatusSchema.parse(payload);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, branchId: true, status: true, orderNumber: true },
    });
    if (!order) throw new NotFoundError("Order not found");
    assertBranchAccess(user, order.branchId);

    if (order.status === input.status) return { status: order.status };

    if (!canTransition(order.status, input.status)) {
      throw new BusinessRuleError(
        `${order.orderNumber} cannot move from ${order.status.replace(/_/g, " ").toLowerCase()} to ${input.status.replace(/_/g, " ").toLowerCase()}`,
      );
    }

    await prisma.$transaction((tx) =>
      setOrderStatus(tx, {
        orderId: order.id,
        status: input.status,
        actor: { userId: user.id, userName: user.name, branchId: order.branchId },
        note: "Updated from the scan station",
      }),
    );

    await prisma.scanEvent.create({
      data: {
        branchId: order.branchId,
        rawCode: order.orderNumber,
        resolvedAs: "ORDER",
        orderId: order.id,
        succeeded: true,
        source: "KEYBOARD",
        action: `Status → ${input.status}`,
        message: `${order.status} → ${input.status}`,
        scannedById: user.id,
      },
    });

    await recordAudit({
      userId: user.id,
      branchId: order.branchId,
      action: "ORDER_STATUS_CHANGED",
      entity: "Order",
      entityId: order.id,
      summary: `${order.orderNumber}: ${order.status} → ${input.status} (scan station)`,
    });

    revalidatePath("/scan");
    revalidatePath(`/orders/${order.id}`);
    revalidatePath("/orders");
    revalidatePath("/overview");
    return { status: input.status };
  });
}

const scanPaymentSchema = z.object({
  orderId: cuidSchema,
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
  method: paymentMethodSchema.default("CASH"),
  reference: z.string().trim().max(120).optional(),
});

/** Take money at the scan station without leaving the card. */
export async function scanPaymentAction(
  payload: unknown,
): Promise<ActionResult<{ paymentNumber: string; outstanding: number }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.BILLING_RECORD_PAYMENT);
    const input = scanPaymentSchema.parse(payload);

    const limit = rateLimit(
      `scanpay:${user.id}`,
      RATE_LIMITS.MUTATION.limit,
      RATE_LIMITS.MUTATION.windowMs,
    );
    if (!limit.success) throw new BusinessRuleError("Too many payments too quickly");

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        branchId: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
      },
    });
    if (!order) throw new NotFoundError("Order not found");
    assertBranchAccess(user, order.branchId);

    if (["CANCELLED", "REFUNDED"].includes(order.status)) {
      throw new BusinessRuleError("This order is closed — no further payments can be taken");
    }

    const outstanding = round2(num(order.totalAmount) - num(order.paidAmount));
    if (input.amount > outstanding) {
      throw new BusinessRuleError(
        `Only ${formatCurrency(outstanding)} is outstanding on ${order.orderNumber}`,
      );
    }

    const invoice = await prisma.invoice.findFirst({
      where: { orderId: order.id },
      select: { id: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          paymentNumber: await nextPaymentNumber(tx),
          branchId: order.branchId,
          orderId: order.id,
          invoiceId: invoice?.id ?? null,
          amount: input.amount,
          method: input.method,
          provider: "MANUAL",
          state: "CAPTURED",
          reference: input.reference ?? null,
          notes: "Collected at the scan station",
          receivedById: user.id,
        },
        select: { paymentNumber: true },
      });

      await recalcOrderPayments(tx, order.id);

      const refreshed = await tx.order.findUnique({
        where: { id: order.id },
        select: { outstandingAmount: true },
      });

      return {
        paymentNumber: payment.paymentNumber,
        outstanding: num(refreshed?.outstandingAmount),
      };
    });

    await prisma.scanEvent.create({
      data: {
        branchId: order.branchId,
        rawCode: order.orderNumber,
        resolvedAs: "ORDER",
        orderId: order.id,
        succeeded: true,
        source: "KEYBOARD",
        action: `Payment ${formatCurrency(input.amount)}`,
        message: `${input.method} · ${result.paymentNumber}`,
        scannedById: user.id,
      },
    });

    await recordAudit({
      userId: user.id,
      branchId: order.branchId,
      action: "PAYMENT_RECORDED",
      entity: "Payment",
      entityId: result.paymentNumber,
      summary: `${formatCurrency(input.amount)} on ${order.orderNumber} via ${input.method} (scan station)`,
    });

    revalidatePath("/scan");
    revalidatePath(`/orders/${order.id}`);
    revalidatePath("/billing");
    return result;
  });
}
