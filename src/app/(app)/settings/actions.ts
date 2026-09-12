"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/rbac";
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
import { formatCurrency } from "@/lib/money";
import { nextExpenseNumber } from "@/lib/sequence";
import { resendNotification } from "@/lib/services/notifications";
import {
  branchSchema,
  expenseDecisionSchema,
  expenseSchema,
  garmentTypeSchema,
  notificationTemplateSchema,
  serviceRateSchema,
  serviceSchema,
  settingSchema,
} from "@/lib/validations/settings";

export async function saveBranchAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.BRANCH_MANAGE);
    const input = branchSchema.parse(payload);

    if (input.id && input.parentId === input.id) {
      throw new BusinessRuleError("A branch cannot be its own parent");
    }

    const data = {
      code: input.code,
      name: input.name,
      type: input.type,
      parentId: input.parentId ?? null,
      addressLine: input.addressLine ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      gstNumber: input.gstNumber ?? null,
      openingTime: input.openingTime ?? null,
      closingTime: input.closingTime ?? null,
      isActive: input.isActive,
    };

    const branch = input.id
      ? await prisma.branch.update({ where: { id: input.id }, data })
      : await prisma.branch.create({ data });

    await recordAudit({
      userId: user.id,
      branchId: branch.id,
      action: input.id ? "BRANCH_UPDATED" : "BRANCH_CREATED",
      entity: "Branch",
      entityId: branch.id,
      summary: `${branch.code} — ${branch.name}`,
    });

    revalidatePath("/settings/branches");
    return { id: branch.id };
  });
}

export async function saveServiceAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.CATALOGUE_MANAGE);
    const input = serviceSchema.parse(payload);

    const data = {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      pricingMode: input.pricingMode,
      basePrice: input.basePrice,
      turnaroundHours: input.turnaroundHours,
      stages: input.stages,
      isActive: input.isActive,
    };

    const service = input.id
      ? await prisma.service.update({ where: { id: input.id }, data })
      : await prisma.service.create({ data });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: input.id ? "SERVICE_UPDATED" : "SERVICE_CREATED",
      entity: "Service",
      entityId: service.id,
      summary: `${service.code} — ${service.name} at ${formatCurrency(service.basePrice)}`,
    });

    revalidatePath("/settings/catalogue");
    return { id: service.id };
  });
}

export async function saveGarmentTypeAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.CATALOGUE_MANAGE);
    const input = garmentTypeSchema.parse(payload);

    const data = {
      code: input.code,
      name: input.name,
      category: input.category.toUpperCase(),
      isActive: input.isActive,
    };

    const garmentType = input.id
      ? await prisma.garmentType.update({ where: { id: input.id }, data })
      : await prisma.garmentType.create({ data });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: input.id ? "GARMENT_TYPE_UPDATED" : "GARMENT_TYPE_CREATED",
      entity: "GarmentType",
      entityId: garmentType.id,
      summary: `${garmentType.code} — ${garmentType.name}`,
    });

    revalidatePath("/settings/catalogue");
    return { id: garmentType.id };
  });
}

export async function saveServiceRateAction(payload: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.CATALOGUE_MANAGE);
    const input = serviceRateSchema.parse(payload);

    await prisma.serviceRate.upsert({
      where: {
        serviceId_garmentTypeId: {
          serviceId: input.serviceId,
          garmentTypeId: input.garmentTypeId,
        },
      },
      create: input,
      update: { price: input.price },
    });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "SERVICE_RATE_SAVED",
      entity: "ServiceRate",
      summary: `Rate set to ${formatCurrency(input.price)}`,
    });

    revalidatePath("/settings/catalogue");
    return null;
  });
}

export async function saveTemplateAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.NOTIFICATION_MANAGE);
    const input = notificationTemplateSchema.parse(payload);

    const data = {
      code: input.code,
      name: input.name,
      channel: input.channel,
      event: input.event,
      subject: input.subject ?? null,
      body: input.body,
      isActive: input.isActive,
    };

    const template = input.id
      ? await prisma.notificationTemplate.update({ where: { id: input.id }, data })
      : await prisma.notificationTemplate.create({ data });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: input.id ? "TEMPLATE_UPDATED" : "TEMPLATE_CREATED",
      entity: "NotificationTemplate",
      entityId: template.id,
      summary: `${template.code} (${template.channel})`,
    });

    revalidatePath("/settings/notifications");
    return { id: template.id };
  });
}

export async function resendNotificationAction(
  notificationId: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.NOTIFICATION_MANAGE);
    const success = await resendNotification(notificationId);

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "NOTIFICATION_RESENT",
      entity: "Notification",
      entityId: notificationId,
      summary: success ? "Resent successfully" : "Resend failed",
    });

    revalidatePath("/settings/notifications");
    if (!success) throw new BusinessRuleError("The provider rejected the message");
    return null;
  });
}

export async function saveSettingsAction(payload: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.SETTINGS_MANAGE);
    const input = settingSchema.parse(payload);

    const entries: { key: string; value: string; category: string }[] = [
      { key: "gst_rate", value: String(input.gstRate), category: "billing" },
      { key: "app_name", value: input.appName, category: "general" },
      {
        key: "default_turnaround_hours",
        value: String(input.defaultTurnaroundHours),
        category: "operations",
      },
      {
        key: "low_stock_alerts",
        value: String(input.lowStockAlerts),
        category: "inventory",
      },
    ];

    await prisma.$transaction(
      entries.map((entry) =>
        prisma.setting.upsert({
          where: { key: entry.key },
          create: entry,
          update: { value: entry.value },
        }),
      ),
    );

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "SETTINGS_UPDATED",
      entity: "Setting",
      summary: "System settings changed",
      after: input,
    });

    revalidatePath("/settings");
    return null;
  });
}

export async function createExpenseAction(
  payload: unknown,
): Promise<ActionResult<{ expenseNumber: string }>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.EXPENSE_MANAGE);
    const input = expenseSchema.parse(payload);
    const branchId = requireWriteBranch(user, input.branchId);

    const expense = await prisma.expense.create({
      data: {
        expenseNumber: await nextExpenseNumber(),
        branchId,
        category: input.category,
        amount: input.amount,
        description: input.description,
        paidTo: input.paidTo ?? null,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        expenseDate: input.expenseDate,
        createdById: user.id,
      },
      select: { id: true, expenseNumber: true },
    });

    await recordAudit({
      userId: user.id,
      branchId,
      action: "EXPENSE_RECORDED",
      entity: "Expense",
      entityId: expense.id,
      summary: `${expense.expenseNumber} — ${formatCurrency(input.amount)} (${input.category})`,
    });

    revalidatePath("/settings/expenses");
    return { expenseNumber: expense.expenseNumber };
  });
}

export async function decideExpenseAction(payload: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await authorize(PERMISSIONS.EXPENSE_APPROVE);
    const input = expenseDecisionSchema.parse(payload);

    const expense = await prisma.expense.findUnique({
      where: { id: input.expenseId },
      select: { id: true, branchId: true, expenseNumber: true, status: true },
    });
    if (!expense) throw new NotFoundError("Expense not found");
    assertBranchAccess(user, expense.branchId);

    await prisma.expense.update({
      where: { id: expense.id },
      data: {
        status: input.status,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });

    await recordAudit({
      userId: user.id,
      branchId: expense.branchId,
      action: `EXPENSE_${input.status}`,
      entity: "Expense",
      entityId: expense.id,
      summary: `${expense.expenseNumber} ${input.status.toLowerCase()}`,
    });

    revalidatePath("/settings/expenses");
    return null;
  });
}
