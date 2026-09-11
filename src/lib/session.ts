import "server-only";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isGlobalRole, type PermissionCode } from "@/lib/rbac";
import type { UserRole } from "@/generated/prisma/enums";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: UserRole;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  employeeCode: string | null;
  permissions: PermissionCode[];
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class AuthenticationError extends Error {
  constructor(message = "You must be signed in") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    image: session.user.image,
    role: session.user.role,
    branchId: session.user.branchId,
    branchName: session.user.branchName,
    branchCode: session.user.branchCode,
    employeeCode: session.user.employeeCode,
    permissions: session.user.permissions ?? [],
  };
}

/** For pages: bounces to /login when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function hasPermission(
  user: Pick<SessionUser, "permissions">,
  permission: PermissionCode | PermissionCode[],
): boolean {
  const wanted = Array.isArray(permission) ? permission : [permission];
  return wanted.some((code) => user.permissions.includes(code));
}

export function hasAllPermissions(
  user: Pick<SessionUser, "permissions">,
  permissions: PermissionCode[],
): boolean {
  return permissions.every((code) => user.permissions.includes(code));
}

/** For pages: 403 page when the signed-in user lacks the permission. */
export async function requirePermission(
  permission: PermissionCode | PermissionCode[],
): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) redirect("/forbidden");
  return user;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function authorize(
  permission: PermissionCode | PermissionCode[],
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
  if (!hasPermission(user, permission)) throw new AuthorizationError();
  return user;
}

/**
 * Branch scoping. Global roles may query any branch (or all of them); everyone
 * else is pinned to the branch they belong to, whatever the request asks for.
 */
export function resolveBranchScope(
  user: SessionUser,
  requestedBranchId?: string | null,
): { branchId?: string; canSeeAllBranches: boolean } {
  const canSeeAllBranches =
    isGlobalRole(user.role) ||
    user.permissions.includes("dashboard.view_all_branches" as PermissionCode);

  if (!canSeeAllBranches) {
    return { branchId: user.branchId ?? "__no_branch__", canSeeAllBranches: false };
  }

  if (requestedBranchId && requestedBranchId !== "all") {
    return { branchId: requestedBranchId, canSeeAllBranches: true };
  }

  return { branchId: undefined, canSeeAllBranches: true };
}

/** Throws if a user tries to touch a record belonging to another branch. */
export function assertBranchAccess(user: SessionUser, branchId: string | null) {
  if (isGlobalRole(user.role)) return;
  if (!branchId) return;
  if (user.branchId !== branchId) {
    throw new AuthorizationError("This record belongs to a different branch");
  }
}

/** The branch a newly created record should be filed under. */
export function requireWriteBranch(
  user: SessionUser,
  requestedBranchId?: string | null,
): string {
  if (isGlobalRole(user.role)) {
    const branchId = requestedBranchId ?? user.branchId;
    if (!branchId) throw new AuthorizationError("A branch must be selected");
    return branchId;
  }
  if (!user.branchId) {
    throw new AuthorizationError("Your account is not assigned to a branch");
  }
  if (requestedBranchId && requestedBranchId !== user.branchId) {
    throw new AuthorizationError("You can only create records for your own branch");
  }
  return user.branchId;
}
