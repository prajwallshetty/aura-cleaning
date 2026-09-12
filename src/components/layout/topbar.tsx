"use client";

import Link from "next/link";
import { Menu, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import type { Alert } from "@/lib/services/alerts";
import type { UserRole } from "@/generated/prisma/enums";

interface TopbarProps {
  name: string;
  email: string;
  role: UserRole;
  branchName: string | null;
  alerts: { alerts: Alert[]; total: number };
  canScan: boolean;
  onOpenSidebar: () => void;
}

export function Topbar({
  name,
  email,
  role,
  branchName,
  alerts,
  canScan,
  onOpenSidebar,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <div className="flex-1">
        <GlobalSearch />
      </div>

      {canScan ? (
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link href="/scan">
            <ScanLine /> Scan
          </Link>
        </Button>
      ) : null}

      <NotificationBell feed={alerts} />

      <UserMenu name={name} email={email} role={role} branchName={branchName} />
    </header>
  );
}
