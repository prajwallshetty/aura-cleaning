import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isGlobalRole } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const openComplaints = user.permissions.includes("complaints.view")
    ? await prisma.complaint.count({
        where: {
          status: { in: ["OPEN", "UNDER_INVESTIGATION"] },
          ...(isGlobalRole(user.role) || !user.branchId
            ? {}
            : { branchId: user.branchId }),
        },
      })
    : 0;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        branchName: user.branchName,
        permissions: user.permissions,
      }}
      openComplaints={openComplaints}
    >
      {children}
    </AppShell>
  );
}
