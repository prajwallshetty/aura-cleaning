"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import {
  BusinessRuleError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(128)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[0-9]/, "Include a digit"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Choose a password you have not used here before",
    path: ["newPassword"],
  });

export async function changePasswordAction(payload: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser();
    const input = changePasswordSchema.parse(payload);

    const limit = rateLimit(
      `password:${user.id}`,
      RATE_LIMITS.LOGIN.limit,
      RATE_LIMITS.LOGIN.windowMs,
    );
    if (!limit.success) {
      throw new BusinessRuleError("Too many attempts — try again in a few minutes");
    }

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!record) throw new BusinessRuleError("Account not found");

    const valid = await bcrypt.compare(input.currentPassword, record.passwordHash);
    if (!valid) throw new BusinessRuleError("Your current password is not correct");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(input.newPassword, 12),
        mustChangePassword: false,
      },
    });

    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "PASSWORD_CHANGED",
      entity: "User",
      entityId: user.id,
      summary: `${user.email} changed their own password`,
    });

    return null;
  });
}
