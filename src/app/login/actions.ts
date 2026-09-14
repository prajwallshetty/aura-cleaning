"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { flattenZodError, type ActionResult } from "@/lib/action-result";
import { ROLE_LANDING_PATH } from "@/lib/rbac";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  callbackUrl: z.string().optional(),
});

export type LoginState = ActionResult<{ redirectTo: string }> | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the details you entered",
      fieldErrors: flattenZodError(parsed.error),
    };
  }

  const { email, password, callbackUrl } = parsed.data;

  // Throttle by IP and by account, so neither a single client nor a single
  // target account can be hammered.
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown";

  for (const key of [`login:ip:${ip}`, `login:email:${email}`]) {
    const limit = rateLimit(key, RATE_LIMITS.LOGIN.limit, RATE_LIMITS.LOGIN.windowMs);
    if (!limit.success) {
      return {
        ok: false,
        error: "Too many sign-in attempts. Please try again in a few minutes.",
      };
    }
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      await recordAudit({
        action: "LOGIN_FAILED",
        entity: "User",
        summary: `Failed sign-in attempt for ${email}`,
      });
      return { ok: false, error: "Incorrect email or password" };
    }
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, branchId: true, role: true },
  });

  if (user) {
    await recordAudit({
      userId: user.id,
      branchId: user.branchId,
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
      summary: `${email} signed in`,
    });
  }

  const landing = user ? ROLE_LANDING_PATH[user.role] : "/dashboard";
  const target =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : landing;

  return { ok: true, data: { redirectTo: target } };
}
