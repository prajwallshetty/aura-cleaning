"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { Alert } from "@/lib/services/alerts";
import type { PermissionCode } from "@/lib/rbac";
import type { UserRole } from "@/generated/prisma/enums";

interface AppShellProps {
  user: {
    name: string;
    email: string;
    role: UserRole;
    branchName: string | null;
    permissions: PermissionCode[];
  };
  alerts: { alerts: Alert[]; total: number };
  children: ReactNode;
}

export function AppShell({ user, alerts, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Keying the content on the path restarts the entrance animation on every
  // navigation, which is what makes moving between screens read as a page turn
  // rather than a swap.
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar
        permissions={user.permissions}
        isDriver={user.role === "DRIVER"}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar
          name={user.name}
          email={user.email}
          role={user.role}
          branchName={user.branchName}
          alerts={alerts}
          canScan={user.permissions.includes("garments.scan" as PermissionCode)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5 sm:py-6">
          <div key={pathname} className="route-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
