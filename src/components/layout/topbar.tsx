"use client";

import Link from "next/link";
import { Bell, Menu, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/global-search";
import { UserMenu } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/generated/prisma/enums";

interface TopbarProps {
  name: string;
  email: string;
  role: UserRole;
  branchName: string | null;
  openComplaints: number;
  canScan: boolean;
  onOpenSidebar: () => void;
}

export function Topbar({
  name,
  email,
  role,
  branchName,
  openComplaints,
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
          <Link href="/garments/scan">
            <ScanLine /> Scan
          </Link>
        </Button>
      ) : null}

      <Button asChild variant="ghost" size="icon" className="relative">
        <Link href="/complaints?status=OPEN" aria-label="Open complaints">
          <Bell />
          {openComplaints > 0 ? (
            <Badge
              tone="danger"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px]"
            >
              {openComplaints > 99 ? "99+" : openComplaints}
            </Badge>
          ) : null}
        </Link>
      </Button>

      <UserMenu name={name} email={email} role={role} branchName={branchName} />
    </header>
  );
}
