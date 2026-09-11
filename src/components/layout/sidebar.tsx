"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shirt, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { DRIVER_NAV, visibleSections, type NavItem } from "@/components/layout/nav-config";
import type { PermissionCode } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  permissions: PermissionCode[];
  isDriver: boolean;
  open: boolean;
  onClose: () => void;
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function Sidebar({ permissions, isDriver, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const sections = visibleSections(permissions);
  const showDriverLink = isDriver && permissions.includes(DRIVER_NAV.permissions[0]);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Shirt className="size-4" aria-hidden />
            </span>
            <span className="text-sm tracking-tight">Aura Laundry ERP</span>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X />
          </Button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-3 py-4">
          {showDriverLink ? (
            <NavGroup
              items={[DRIVER_NAV]}
              pathname={pathname}
              onNavigate={onClose}
            />
          ) : null}

          {sections.map((section, index) => (
            <div key={section.label ?? `section-${index}`} className="space-y-1">
              {section.label ? (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  {section.label}
                </p>
              ) : null}
              <NavGroup items={section.items} pathname={pathname} onNavigate={onClose} />
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="text-[11px] text-sidebar-muted">
            Order → Garment → Processing → Location → Delivery
          </p>
        </div>
      </aside>
    </>
  );
}

function NavGroup({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
