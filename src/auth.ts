import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { resolvePermissions } from "@/lib/permissions.server";
import type { PermissionCode } from "@/lib/rbac";
import type { UserRole } from "@/generated/prisma/enums";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: { branch: { select: { id: true, name: true, code: true } } },
        });

        // Constant-ish work whether or not the user exists, so that response
        // timing does not reveal which accounts are registered.
        const hash =
          user?.passwordHash ??
          "$2b$12$zzzzzzzzzzzzzzzzzzzzzuqPZ4Q6h9sMDHuXvFqPqjHkYQ4H3XhO2";
        const valid = await bcrypt.compare(password, hash);

        if (!user || !valid) return null;
        if (user.status !== "ACTIVE") return null;

        const permissions = await resolvePermissions(user.id, user.role);

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          branchId: user.branchId,
          branchName: user.branch?.name ?? null,
          branchCode: user.branch?.code ?? null,
          employeeCode: user.employeeCode,
          permissions,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
        token.branchCode = user.branchCode;
        token.employeeCode = user.employeeCode;
        token.permissions = user.permissions;
      }

      // Re-read role/branch/permissions when the client explicitly asks for a
      // refresh (e.g. after an admin changes this user's access).
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: { branch: { select: { id: true, name: true, code: true } } },
        });
        if (fresh && fresh.status === "ACTIVE") {
          token.role = fresh.role;
          token.branchId = fresh.branchId;
          token.branchName = fresh.branch?.name ?? null;
          token.branchCode = fresh.branch?.code ?? null;
          token.permissions = await resolvePermissions(fresh.id, fresh.role);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.branchId = (token.branchId as string | null) ?? null;
        session.user.branchName = (token.branchName as string | null) ?? null;
        session.user.branchCode = (token.branchCode as string | null) ?? null;
        session.user.employeeCode = (token.employeeCode as string | null) ?? null;
        session.user.permissions = (token.permissions as PermissionCode[]) ?? [];
      }
      return session;
    },
  },
});
