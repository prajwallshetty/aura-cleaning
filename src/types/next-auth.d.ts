import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";
import type { PermissionCode } from "@/lib/rbac";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      branchId: string | null;
      branchName: string | null;
      branchCode: string | null;
      employeeCode: string | null;
      permissions: PermissionCode[];
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    branchId: string | null;
    branchName?: string | null;
    branchCode?: string | null;
    employeeCode?: string | null;
    permissions: PermissionCode[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    branchId: string | null;
    branchName: string | null;
    branchCode: string | null;
    employeeCode: string | null;
    permissions: PermissionCode[];
  }
}
