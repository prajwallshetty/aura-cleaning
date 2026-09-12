import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getAlerts } from "@/lib/services/alerts";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const alerts = await getAlerts(user);

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        branchName: user.branchName,
        permissions: user.permissions,
      }}
      alerts={{ alerts: alerts.alerts, total: alerts.total }}
    >
      {children}
    </AppShell>
  );
}
