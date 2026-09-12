import type { UserRole } from "@/generated/prisma/enums";

/**
 * Permission catalogue. Every server action and route handler authorises against
 * one of these codes — never against a role directly — so that per-user grants
 * and revocations can override the role defaults.
 */
export const PERMISSIONS = {
  // Dashboard & analytics
  DASHBOARD_VIEW: "dashboard.view",
  DASHBOARD_VIEW_FINANCIALS: "dashboard.view_financials",
  DASHBOARD_VIEW_ALL_BRANCHES: "dashboard.view_all_branches",

  // Orders
  ORDER_VIEW: "orders.view",
  ORDER_CREATE: "orders.create",
  ORDER_UPDATE: "orders.update",
  ORDER_DELETE: "orders.delete",
  ORDER_CANCEL: "orders.cancel",
  ORDER_OVERRIDE_PRICE: "orders.override_price",
  ORDER_APPLY_DISCOUNT: "orders.apply_discount",

  // Garments
  GARMENT_VIEW: "garments.view",
  GARMENT_SCAN: "garments.scan",
  GARMENT_UPDATE: "garments.update",
  GARMENT_PHOTO_UPLOAD: "garments.photo_upload",

  // Processing
  PROCESSING_VIEW: "processing.view",
  PROCESSING_SORTING: "processing.sorting",
  PROCESSING_WASHING: "processing.washing",
  PROCESSING_DRYING: "processing.drying",
  PROCESSING_IRONING: "processing.ironing",
  PROCESSING_QC: "processing.qc",
  PROCESSING_PACKING: "processing.packing",

  // Rack & location
  RACK_VIEW: "racks.view",
  RACK_MANAGE: "racks.manage",
  RACK_ASSIGN: "racks.assign",

  // Delivery
  DELIVERY_VIEW: "delivery.view",
  DELIVERY_MANAGE: "delivery.manage",
  DELIVERY_ASSIGN_DRIVER: "delivery.assign_driver",
  DELIVERY_DRIVE: "delivery.drive",
  DELIVERY_COLLECT_PAYMENT: "delivery.collect_payment",

  // Billing
  BILLING_VIEW: "billing.view",
  BILLING_CREATE_INVOICE: "billing.create_invoice",
  BILLING_RECORD_PAYMENT: "billing.record_payment",
  BILLING_REFUND: "billing.refund",

  // Inventory
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",
  INVENTORY_TRANSFER: "inventory.transfer",
  INVENTORY_ADJUST: "inventory.adjust",

  // Customers
  CUSTOMER_VIEW: "customers.view",
  CUSTOMER_MANAGE: "customers.manage",

  // Purchases
  PURCHASE_VIEW: "purchases.view",
  PURCHASE_MANAGE: "purchases.manage",
  PURCHASE_PAY: "purchases.pay",

  // B2B
  B2B_VIEW: "b2b.view",
  B2B_MANAGE: "b2b.manage",
  B2B_BILLING: "b2b.billing",

  // Staff
  STAFF_VIEW: "staff.view",
  STAFF_MANAGE: "staff.manage",
  STAFF_ATTENDANCE: "staff.attendance",
  STAFF_APPROVE_LEAVE: "staff.approve_leave",

  // Complaints
  COMPLAINT_VIEW: "complaints.view",
  COMPLAINT_CREATE: "complaints.create",
  COMPLAINT_MANAGE: "complaints.manage",
  COMPLAINT_RESOLVE: "complaints.resolve",

  // Reports
  REPORT_VIEW: "reports.view",
  REPORT_SALES: "reports.sales",
  REPORT_OPERATIONS: "reports.operations",
  REPORT_FINANCE: "reports.finance",
  REPORT_EXPORT: "reports.export",

  // Notifications
  NOTIFICATION_VIEW: "notifications.view",
  NOTIFICATION_MANAGE: "notifications.manage",

  // Expenses
  EXPENSE_VIEW: "expenses.view",
  EXPENSE_MANAGE: "expenses.manage",
  EXPENSE_APPROVE: "expenses.approve",

  // Settings & administration
  BRANCH_VIEW: "branches.view",
  BRANCH_MANAGE: "branches.manage",
  CATALOGUE_MANAGE: "catalogue.manage",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_MODULES: Record<PermissionCode, string> = Object.values(
  PERMISSIONS,
).reduce(
  (acc, code) => {
    acc[code] = code.split(".")[0];
    return acc;
  },
  {} as Record<PermissionCode, string>,
);

const P = PERMISSIONS;

const COUNTER_STAFF_PERMISSIONS: PermissionCode[] = [
  P.DASHBOARD_VIEW,
  P.ORDER_VIEW,
  P.ORDER_CREATE,
  P.ORDER_UPDATE,
  P.ORDER_APPLY_DISCOUNT,
  P.GARMENT_VIEW,
  P.GARMENT_SCAN,
  P.GARMENT_UPDATE,
  P.GARMENT_PHOTO_UPLOAD,
  P.CUSTOMER_VIEW,
  P.CUSTOMER_MANAGE,
  P.PROCESSING_VIEW,
  P.RACK_VIEW,
  P.RACK_ASSIGN,
  P.DELIVERY_VIEW,
  P.BILLING_VIEW,
  P.BILLING_CREATE_INVOICE,
  P.BILLING_RECORD_PAYMENT,
  P.COMPLAINT_VIEW,
  P.COMPLAINT_CREATE,
  P.NOTIFICATION_VIEW,
];

/** Shared baseline for every shop-floor processing role. */
const processingRole = (stage: PermissionCode): PermissionCode[] => [
  P.DASHBOARD_VIEW,
  P.ORDER_VIEW,
  P.GARMENT_VIEW,
  P.GARMENT_SCAN,
  P.PROCESSING_VIEW,
  stage,
  P.RACK_VIEW,
];

const ACCOUNTANT_PERMISSIONS: PermissionCode[] = [
  P.DASHBOARD_VIEW,
  P.DASHBOARD_VIEW_FINANCIALS,
  P.DASHBOARD_VIEW_ALL_BRANCHES,
  P.ORDER_VIEW,
  P.GARMENT_VIEW,
  P.CUSTOMER_VIEW,
  P.BILLING_VIEW,
  P.BILLING_CREATE_INVOICE,
  P.BILLING_RECORD_PAYMENT,
  P.BILLING_REFUND,
  P.PURCHASE_VIEW,
  P.PURCHASE_PAY,
  P.B2B_VIEW,
  P.B2B_BILLING,
  P.EXPENSE_VIEW,
  P.EXPENSE_MANAGE,
  P.EXPENSE_APPROVE,
  P.INVENTORY_VIEW,
  P.REPORT_VIEW,
  P.REPORT_SALES,
  P.REPORT_FINANCE,
  P.REPORT_OPERATIONS,
  P.REPORT_EXPORT,
  P.NOTIFICATION_VIEW,
];

const BRANCH_MANAGER_PERMISSIONS: PermissionCode[] = [
  ...COUNTER_STAFF_PERMISSIONS,
  P.DASHBOARD_VIEW_FINANCIALS,
  P.ORDER_CANCEL,
  P.ORDER_OVERRIDE_PRICE,
  P.PROCESSING_SORTING,
  P.PROCESSING_WASHING,
  P.PROCESSING_DRYING,
  P.PROCESSING_IRONING,
  P.PROCESSING_QC,
  P.PROCESSING_PACKING,
  P.RACK_MANAGE,
  P.DELIVERY_MANAGE,
  P.DELIVERY_ASSIGN_DRIVER,
  P.DELIVERY_COLLECT_PAYMENT,
  P.BILLING_REFUND,
  P.INVENTORY_VIEW,
  P.INVENTORY_MANAGE,
  P.INVENTORY_TRANSFER,
  P.INVENTORY_ADJUST,
  P.PURCHASE_VIEW,
  P.PURCHASE_MANAGE,
  P.B2B_VIEW,
  P.STAFF_VIEW,
  P.STAFF_MANAGE,
  P.STAFF_ATTENDANCE,
  P.STAFF_APPROVE_LEAVE,
  P.COMPLAINT_MANAGE,
  P.COMPLAINT_RESOLVE,
  P.REPORT_VIEW,
  P.REPORT_SALES,
  P.REPORT_OPERATIONS,
  P.REPORT_EXPORT,
  P.EXPENSE_VIEW,
  P.EXPENSE_MANAGE,
  P.NOTIFICATION_MANAGE,
];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionCode[];

/**
 * Default role → permission matrix. Seeded into the database as RolePermission
 * rows; per-user overrides live in UserPermission.
 */
export const ROLE_PERMISSIONS: Record<UserRole, PermissionCode[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  OWNER: ALL_PERMISSIONS,
  BRANCH_MANAGER: [...new Set(BRANCH_MANAGER_PERMISSIONS)],
  COUNTER_STAFF: [...new Set(COUNTER_STAFF_PERMISSIONS)],
  WASHING_STAFF: [
    ...processingRole(P.PROCESSING_WASHING),
    P.PROCESSING_DRYING,
    P.PROCESSING_SORTING,
  ],
  IRONING_STAFF: processingRole(P.PROCESSING_IRONING),
  QC_STAFF: [...processingRole(P.PROCESSING_QC), P.COMPLAINT_CREATE, P.COMPLAINT_VIEW],
  PACKING_STAFF: [
    ...processingRole(P.PROCESSING_PACKING),
    P.RACK_ASSIGN,
  ],
  DRIVER: [
    P.DASHBOARD_VIEW,
    P.ORDER_VIEW,
    P.GARMENT_SCAN,
    P.DELIVERY_VIEW,
    P.DELIVERY_DRIVE,
    P.DELIVERY_COLLECT_PAYMENT,
  ],
  ACCOUNTANT: [...new Set(ACCOUNTANT_PERMISSIONS)],
};

/** Roles that may see data across every branch rather than just their own. */
export const GLOBAL_ROLES: UserRole[] = ["SUPER_ADMIN", "OWNER", "ACCOUNTANT"];

export function isGlobalRole(role: UserRole): boolean {
  return GLOBAL_ROLES.includes(role);
}

export function defaultPermissionsFor(role: UserRole): PermissionCode[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  COUNTER_STAFF: "Counter Staff",
  WASHING_STAFF: "Washing Staff",
  IRONING_STAFF: "Ironing Staff",
  QC_STAFF: "QC Staff",
  PACKING_STAFF: "Packing Staff",
  DRIVER: "Driver",
  ACCOUNTANT: "Accountant",
};

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [P.DASHBOARD_VIEW]: "View the operational dashboard",
  [P.DASHBOARD_VIEW_FINANCIALS]: "See revenue and outstanding figures on the dashboard",
  [P.DASHBOARD_VIEW_ALL_BRANCHES]: "See data for every branch, not just the assigned one",
  [P.ORDER_VIEW]: "View orders",
  [P.ORDER_CREATE]: "Create new orders",
  [P.ORDER_UPDATE]: "Edit orders and advance their status",
  [P.ORDER_DELETE]: "Delete orders",
  [P.ORDER_CANCEL]: "Cancel orders",
  [P.ORDER_OVERRIDE_PRICE]: "Override calculated prices",
  [P.ORDER_APPLY_DISCOUNT]: "Apply discounts to orders",
  [P.GARMENT_VIEW]: "View garments and their history",
  [P.GARMENT_SCAN]: "Scan garment QR codes and barcodes",
  [P.GARMENT_UPDATE]: "Edit garment details",
  [P.GARMENT_PHOTO_UPLOAD]: "Upload garment photos",
  [P.CUSTOMER_VIEW]: "View the customer directory and order history",
  [P.CUSTOMER_MANAGE]: "Add and edit customer records",
  [P.PROCESSING_VIEW]: "View processing workstations",
  [P.PROCESSING_SORTING]: "Operate the sorting workstation",
  [P.PROCESSING_WASHING]: "Operate the washing workstation",
  [P.PROCESSING_DRYING]: "Operate the drying workstation",
  [P.PROCESSING_IRONING]: "Operate the ironing workstation",
  [P.PROCESSING_QC]: "Operate quality control",
  [P.PROCESSING_PACKING]: "Operate the packing workstation",
  [P.RACK_VIEW]: "View racks and slots",
  [P.RACK_MANAGE]: "Create and edit racks and slots",
  [P.RACK_ASSIGN]: "Assign orders and garments to slots",
  [P.DELIVERY_VIEW]: "View pickups and deliveries",
  [P.DELIVERY_MANAGE]: "Create and edit pickups and deliveries",
  [P.DELIVERY_ASSIGN_DRIVER]: "Assign drivers to jobs",
  [P.DELIVERY_DRIVE]: "Act on assigned driver jobs",
  [P.DELIVERY_COLLECT_PAYMENT]: "Collect payment on delivery",
  [P.BILLING_VIEW]: "View invoices and payments",
  [P.BILLING_CREATE_INVOICE]: "Generate invoices",
  [P.BILLING_RECORD_PAYMENT]: "Record payments",
  [P.BILLING_REFUND]: "Issue refunds",
  [P.INVENTORY_VIEW]: "View inventory levels",
  [P.INVENTORY_MANAGE]: "Manage inventory items and stock movements",
  [P.INVENTORY_TRANSFER]: "Transfer stock between branches",
  [P.INVENTORY_ADJUST]: "Adjust stock quantities",
  [P.PURCHASE_VIEW]: "View suppliers and purchase orders",
  [P.PURCHASE_MANAGE]: "Manage suppliers, purchase orders and receipts",
  [P.PURCHASE_PAY]: "Record supplier payments",
  [P.B2B_VIEW]: "View corporate accounts",
  [P.B2B_MANAGE]: "Manage corporate accounts, contracts and rate cards",
  [P.B2B_BILLING]: "Generate corporate statements and invoices",
  [P.STAFF_VIEW]: "View staff records",
  [P.STAFF_MANAGE]: "Create and edit staff records",
  [P.STAFF_ATTENDANCE]: "Record attendance",
  [P.STAFF_APPROVE_LEAVE]: "Approve or reject leave requests",
  [P.COMPLAINT_VIEW]: "View complaints",
  [P.COMPLAINT_CREATE]: "Raise complaints",
  [P.COMPLAINT_MANAGE]: "Investigate and assign complaints",
  [P.COMPLAINT_RESOLVE]: "Resolve complaints and award compensation",
  [P.REPORT_VIEW]: "Open the reports module",
  [P.REPORT_SALES]: "View sales reports",
  [P.REPORT_OPERATIONS]: "View operations reports",
  [P.REPORT_FINANCE]: "View finance reports",
  [P.REPORT_EXPORT]: "Export report data",
  [P.NOTIFICATION_VIEW]: "View notification logs",
  [P.NOTIFICATION_MANAGE]: "Manage notification templates and resend messages",
  [P.EXPENSE_VIEW]: "View expenses",
  [P.EXPENSE_MANAGE]: "Record expenses",
  [P.EXPENSE_APPROVE]: "Approve expenses",
  [P.BRANCH_VIEW]: "View branches",
  [P.BRANCH_MANAGE]: "Create and edit branches",
  [P.CATALOGUE_MANAGE]: "Manage services, garment types and rates",
  [P.SETTINGS_MANAGE]: "Change system settings",
  [P.AUDIT_VIEW]: "View audit logs",
};

/** Maps a processing stage to the permission required to operate it. */
export const STAGE_PERMISSION: Record<string, PermissionCode> = {
  SORTING: P.PROCESSING_SORTING,
  WASHING: P.PROCESSING_WASHING,
  DRYING: P.PROCESSING_DRYING,
  IRONING: P.PROCESSING_IRONING,
  QUALITY_CHECK: P.PROCESSING_QC,
  PACKING: P.PROCESSING_PACKING,
  RECEIVING: P.ORDER_CREATE,
  DISPATCH: P.DELIVERY_MANAGE,
};
