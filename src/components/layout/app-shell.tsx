"use client";

import { useState, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
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
  openComplaints: number;
  children: ReactNode;
}

export function AppShell({ user, openComplaints, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          openComplaints={openComplaints}
          canScan={user.permissions.includes("garments.scan" as PermissionCode)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
