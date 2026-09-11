"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/rbac";
import { assertBranchAccess, authorize } from "@/lib/session";
import {
  BusinessRuleError,
  NotFoundError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { formatCurrency, num, round2 } from "@/lib/money";
import { nextPaymentNumber, nextRefundNumber } from "@/lib/sequence";
import { recalcOrderPayments } from "@/lib/services/orders";
import { notify } from "@/lib/services/notifications";
import {
  buildUpiIntentUri,
  getPaymentGateway,
} from "@/lib/providers/payments";
import {
  onlinePaymentIntentSchema,
  recordPaymentSchema,
  refundSchema,
  verifyOnlinePaymentSchema,
} from "@/lib/validations/billing";

export async function recordPaymentAction(
  payload: unknown,
): Promise<ActionResult<{ paymentNumber: string; outstanding: number }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.BILLING_RECORD_PAYMENT);
    const input = recordPaymentSchema.parse(payload);

    const limit = rateLimit(
      `payment:${user.id}`,
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
        customerName: true,
        customerPhone: true,
        customerEmail: true,
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

    const { payment, newOutstanding } = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
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
          notes: input.notes ?? null,
          receivedById: user.id,
        },
      });

      await recalcOrderPayments(tx, order.id);

      const refreshed = await tx.order.findUnique({
        where: { id: order.id },
        select: { outstandingAmount: true },
      });

      return { payment: created, newOutstanding: num(refreshed?.outstandingAmount) };
    });

    await recordAudit({
      userId: user.id,
      branchId: order.branchId,
      action: "PAYMENT_RECORDED",
      entity: "Payment",
      entityId: payment.id,
      summary: `${formatCurrency(input.amount)} (${input.method}) against ${order.orderNumber}`,
    });

    await notify({
      event: "PAYMENT_RECEIVED",
      orderId: order.id,
      branchId: order.branchId,
      recipientName: order.customerName,
      recipientPhone: order.customerPhone,
      recipientEmail: order.customerEmail,
      variables: {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        amount: formatCurrency(input.amount),
        outstanding: formatCurrency(newOutstanding),
      },
    });

    revalidatePath(`/orders/${order.id}`);
    revalidatePath("/billing");
    revalidatePath("/dashboard");

    return { paymentNumber: payment.paymentNumber, outstanding: newOutstanding };
  });
}

export async function refundAction(
  payload: unknown,
): Promise<ActionResult<{ refundNumber: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.BILLING_REFUND);
    const input = refundSchema.parse(payload);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        branchId: true,
        orderNumber: true,
        paidAmount: true,
        refundedAmount: true,
      },
    });
    if (!order) throw new NotFoundError("Order not found");
    assertBranchAccess(user, order.branchId);

    const refundable = round2(num(order.paidAmount) - num(order.refundedAmount));
    if (input.amount > refundable) {
      throw new BusinessRuleError(
        `At most ${formatCurrency(refundable)} can be refunded on ${order.orderNumber}`,
      );
    }

    // An online capture is reversed through the gateway; counter payments are
    // handed back in cash and only recorded here.
    const onlinePayment = await prisma.payment.findFirst({
      where: {
        orderId: order.id,
        state: "CAPTURED",
        provider: { not: "MANUAL" },
        providerPaymentId: { not: null },
      },
      orderBy: { paidAt: "desc" },
    });

    let providerRefundId: string | null = null;
    if (onlinePayment?.providerPaymentId) {
      const gateway = getPaymentGateway(onlinePayment.provider.toLowerCase());
      const outcome = await gateway.refund({
        providerPaymentId: onlinePayment.providerPaymentId,
        amount: input.amount,
        reason: input.reason,
      });
      providerRefundId = outcome.providerRefundId;
    }

    const refund = await prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          refundNumber: await nextRefundNumber(tx),
          orderId: order.id,
          paymentId: onlinePayment?.id ?? null,
          amount: input.amount,
          method: input.method,
          status: "PROCESSED",
          reason: input.reason,
          notes: [input.notes, providerRefundId ? `Gateway ref ${providerRefundId}` : null]
            .filter(Boolean)
            .join(" · ") || null,
          processedById: user.id,
          processedAt: new Date(),
        },
      });

      await recalcOrderPayments(tx, order.id);
      return created;
    });

    await recordAudit({
      userId: user.id,
      branchId: order.branchId,
      action: "REFUND_ISSUED",
      entity: "Refund",
      entityId: refund.id,
      summary: `${formatCurrency(input.amount)} refunded on ${order.orderNumber}: ${input.reason}`,
    });

    revalidatePath(`/orders/${order.id}`);
    revalidatePath("/billing");
    return { refundNumber: refund.refundNumber };
  });
}

/**
 * Starts an online payment. Secrets stay on the server — only the gateway's
 * public key and the created order id are returned to the browser.
 */
export async function createPaymentIntentAction(
  payload: unknown,
): Promise<ActionResult<{
  provider: string;
  providerOrderId: string;
  clientPayload: Record<string, string | number>;
  upiUri: string | null;
}>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.BILLING_RECORD_PAYMENT);
    const input = onlinePaymentIntentSchema.parse(payload);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        branchId: true,
        orderNumber: true,
        outstandingAmount: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
      },
    });
    if (!order) throw new NotFoundError("Order not found");
    assertBranchAccess(user, order.branchId);

    if (input.amount > num(order.outstandingAmount)) {
      throw new BusinessRuleError("That is more than the outstanding balance");
    }

    const gateway = getPaymentGateway();
    const intent = await gateway.createIntent({
      amount: input.amount,
      reference: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail ?? undefined,
    });

    return {
      provider: gateway.id,
      providerOrderId: intent.providerOrderId,
      clientPayload: intent.clientPayload,
      upiUri: buildUpiIntentUri({
        amount: input.amount,
        reference: order.orderNumber,
        note: `Laundry order ${order.orderNumber}`,
      }),
    };
  });
}

/** Verifies a gateway callback signature and books the payment. */
export async function verifyOnlinePaymentAction(
  payload: unknown,
): Promise<ActionResult<{ paymentNumber: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.BILLING_RECORD_PAYMENT);
    const input = verifyOnlinePaymentSchema.parse(payload);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, branchId: true, orderNumber: true, outstandingAmount: true },
    });
    if (!order) throw new NotFoundError("Order not found");
    assertBranchAccess(user, order.branchId);

    const gateway = getPaymentGateway();
    const verification = await gateway.verify({
      razorpay_order_id: input.razorpay_order_id,
      razorpay_payment_id: input.razorpay_payment_id,
      razorpay_signature: input.razorpay_signature,
    });

    if (!verification.verified) {
      await recordAudit({
        userId: user.id,
        branchId: order.branchId,
        action: "PAYMENT_VERIFICATION_FAILED",
        entity: "Order",
        entityId: order.id,
        summary: `Signature check failed for ${order.orderNumber}: ${verification.reason ?? "unknown"}`,
      });
      throw new BusinessRuleError("Payment could not be verified — nothing was recorded");
    }

    // The gateway may retry; a unique provider payment id keeps this idempotent.
    const existing = await prisma.payment.findFirst({
      where: { providerPaymentId: input.razorpay_payment_id },
      select: { paymentNumber: true },
    });
    if (existing) return { paymentNumber: existing.paymentNumber };

    const invoice = await prisma.invoice.findFirst({
      where: { orderId: order.id },
      select: { id: true },
    });

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          paymentNumber: await nextPaymentNumber(tx),
          branchId: order.branchId,
          orderId: order.id,
          invoiceId: invoice?.id ?? null,
          amount: input.amount,
          method: "ONLINE",
          provider: "RAZORPAY",
          state: "CAPTURED",
          providerOrderId: input.razorpay_order_id,
          providerPaymentId: input.razorpay_payment_id,
          receivedById: user.id,
        },
      });
      await recalcOrderPayments(tx, order.id);
      return created;
    });

    await recordAudit({
      userId: user.id,
      branchId: order.branchId,
      action: "ONLINE_PAYMENT_CAPTURED",
      entity: "Payment",
      entityId: payment.id,
      summary: `${formatCurrency(input.amount)} captured online for ${order.orderNumber}`,
    });

    revalidatePath(`/orders/${order.id}`);
    revalidatePath("/billing");
    return { paymentNumber: payment.paymentNumber };
  });
}

/** Sends a payment reminder for every order with a balance past its due date. */
export async function sendPaymentRemindersAction(): Promise<ActionResult<{ sent: number }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.NOTIFICATION_MANAGE);

    const orders = await prisma.order.findMany({
      where: {
        outstandingAmount: { gt: 0 },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
        expectedDeliveryAt: { lt: new Date() },
        ...(user.branchId && !user.permissions.includes(PERMISSIONS.DASHBOARD_VIEW_ALL_BRANCHES)
          ? { branchId: user.branchId }
          : {}),
      },
      take: 200,
      select: {
        id: true,
        branchId: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        outstandingAmount: true,
      },
    });

    for (const order of orders) {
      await notify({
        event: "PAYMENT_REMINDER",
        orderId: order.id,
        branchId: order.branchId,
        recipientName: order.customerName,
        recipientPhone: order.customerPhone,
        recipientEmail: order.customerEmail,
        variables: {
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          outstanding: formatCurrency(order.outstandingAmount),
        },
      });
    }

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "PAYMENT_REMINDERS_SENT",
      entity: "Notification",
      summary: `${orders.length} payment reminders dispatched`,
    });

    revalidatePath("/billing");
    return { sent: orders.length };
  });
}
