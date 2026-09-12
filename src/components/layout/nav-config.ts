import {
  Boxes,
  LayoutGrid,
  Building2,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  MessageSquareWarning,
  Package,
  Receipt,
  Shapes,
  ScanLine,
  ShieldAlert,
  Settings,
  Shirt,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
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

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        label: "Overview",
        href: "/overview",
        icon: LayoutGrid,
        permissions: [PERMISSIONS.DASHBOARD_VIEW],
        exact: true,
      },
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
        label: "Scan Tag",
        href: "/scan",
        icon: ScanLine,
        permissions: [PERMISSIONS.GARMENT_SCAN],
      },
      {
        label: "Customers",
        href: "/customers",
        icon: Users,
        permissions: [PERMISSIONS.CUSTOMER_VIEW],
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
        label: "Mismatch Center",
        href: "/mismatch",
        icon: ShieldAlert,
        permissions: [PERMISSIONS.TRACKING_VIEW],
      },
      {
        label: "Processing",
        href: "/processing",
        icon: Package,
        permissions: [PERMISSIONS.PROCESSING_VIEW],
      },
      {
        label: "Rack & Location",
        href: "/racks",
        icon: Warehouse,
        permissions: [PERMISSIONS.RACK_VIEW],
      },
      {
        label: "Pickup & Delivery",
        href: "/delivery",
        icon: Truck,
        permissions: [PERMISSIONS.DELIVERY_VIEW],
      },
    ],
  },
  {
    label: "Commercial",
    items: [
      {
        label: "Billing",
        href: "/billing",
        icon: Receipt,
        permissions: [PERMISSIONS.BILLING_VIEW],
      },
      {
        label: "B2B & Corporate",
        href: "/b2b",
        icon: Building2,
        permissions: [PERMISSIONS.B2B_VIEW],
      },
      {
        label: "Complaints",
        href: "/complaints",
        icon: MessageSquareWarning,
        permissions: [PERMISSIONS.COMPLAINT_VIEW],
      },
    ],
  },
  {
    label: "Supply",
    items: [
      {
        label: "Inventory",
        href: "/inventory",
        icon: Boxes,
        permissions: [PERMISSIONS.INVENTORY_VIEW],
      },
      {
        label: "Purchases",
        href: "/purchases",
        icon: ShoppingCart,
        permissions: [PERMISSIONS.PURCHASE_VIEW],
      },
    ],
  },
  {
    label: "Management",
    items: [
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

/** The driver app is a separate, deliberately minimal surface. */
export const DRIVER_NAV: NavItem = {
  label: "My Jobs",
  href: "/driver",
  icon: Truck,
  permissions: [PERMISSIONS.DELIVERY_DRIVE],
};

export function visibleSections(permissions: PermissionCode[]): NavSection[] {
  const has = (item: NavItem) =>
    item.permissions.some((code) => permissions.includes(code));

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(has),
  })).filter((section) => section.items.length > 0);
}
