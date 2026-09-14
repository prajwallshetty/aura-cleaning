import {
  Boxes,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Receipt,
  Shapes,
  ScanLine,
  Settings,
  Shirt,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PERMISSIONS, type PermissionCode } from "@/lib/rbac";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The user needs at least one of these to see the item. */
  permissions: PermissionCode[];
  /** Match sub-routes as active too. */
  exact?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * The whole sidebar, in the order it appears. Kept to exactly the modules the
 * business runs on day to day — every other page in the app is still reachable
 * by URL, but nothing beyond this list gets a permanent menu entry.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permissions: [PERMISSIONS.DASHBOARD_VIEW],
        exact: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Orders",
        href: "/orders",
        icon: ClipboardList,
        permissions: [PERMISSIONS.ORDER_VIEW],
      },
      {
        label: "Garments",
        href: "/garments",
        icon: Shirt,
        permissions: [PERMISSIONS.GARMENT_VIEW, PERMISSIONS.GARMENT_SCAN],
      },
      {
        label: "Categories",
        href: "/tracking",
        icon: Shapes,
        permissions: [PERMISSIONS.TRACKING_VIEW],
      },
      {
        label: "Customers",
        href: "/customers",
        icon: Users,
        permissions: [PERMISSIONS.CUSTOMER_VIEW],
      },
      {
        label: "Scan",
        href: "/scan",
        icon: ScanLine,
        permissions: [PERMISSIONS.GARMENT_SCAN],
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        label: "Payments",
        href: "/billing",
        icon: Receipt,
        permissions: [PERMISSIONS.BILLING_VIEW],
      },
      {
        label: "Inventory",
        href: "/inventory",
        icon: Boxes,
        permissions: [PERMISSIONS.INVENTORY_VIEW],
      },
      {
        label: "Staff",
        href: "/staff",
        icon: Users,
        permissions: [PERMISSIONS.STAFF_VIEW],
      },
      {
        label: "Reports",
        href: "/reports",
        icon: FileBarChart,
        permissions: [PERMISSIONS.REPORT_VIEW],
      },
    ],
  },
  {
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        permissions: [
          PERMISSIONS.SETTINGS_MANAGE,
          PERMISSIONS.BRANCH_VIEW,
          PERMISSIONS.CATALOGUE_MANAGE,
          PERMISSIONS.NOTIFICATION_VIEW,
        ],
      },
    ],
  },
];

export function visibleSections(permissions: PermissionCode[]): NavSection[] {
  const has = (item: NavItem) =>
    item.permissions.some((code) => permissions.includes(code));

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(has),
  })).filter((section) => section.items.length > 0);
}
