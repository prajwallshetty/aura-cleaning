/**
 * Development seed.
 *
 * Builds a small but realistic laundry business: a head office, two branches
 * and a central processing unit, a full staff roster covering every role, a
 * priced catalogue, racks with slots, corporate contracts, consumables — and
 * then books real orders and walks a share of their garments through the
 * pipeline so every screen has something truthful to show.
 *
 * Safe to re-run: it clears the transactional tables first.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";
import type {
  GarmentStatus,
  OrderStatus,
  ProcessingStage,
  UserRole,
} from "../src/generated/prisma/enums";
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS } from "../src/lib/rbac";
import { DEFAULT_NOTIFICATION_BODIES } from "../src/lib/notification-templates";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const BCRYPT_ROUNDS = 10;
const DEMO_PASSWORD = "Aura@Laundry1";

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness, so repeated seeds produce comparable data.
// ---------------------------------------------------------------------------
let seedState = 20260101;
function random(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const randomInt = (min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
/** Clamps a timestamp into the recent past — nothing that already happened
 *  may be dated in the future. */
const pastOnly = (date: Date) => {
  const now = Date.now();
  return date.getTime() > now
    ? new Date(now - randomInt(2, 120) * 60 * 1000)
    : date;
};

const daysAgo = (days: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, randomInt(0, 59), 0, 0);
  // Seeding at, say, 03:00 must not put "today at 14:00" in the future.
  return days === 0 ? pastOnly(date) : date;
};

const hoursFrom = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);

/** Same as hoursFrom, but for events that have already happened. */
const progressedTo = (date: Date, hours: number) => pastOnly(hoursFrom(date, hours));

const FIRST_NAMES = [
  "Priya", "Rahul", "Ananya", "Vikram", "Meera", "Arjun", "Kavya", "Sanjay",
  "Divya", "Rohan", "Nisha", "Karthik", "Sneha", "Amit", "Pooja", "Farhan",
  "Lakshmi", "Imran", "Shreya", "Gautam", "Ritika", "Naveen", "Aisha", "Manish",
];
const LAST_NAMES = [
  "Sharma", "Nair", "Reddy", "Iyer", "Patel", "Menon", "Rao", "Khan",
  "Desai", "Joshi", "Verma", "Pillai", "Bose", "Kulkarni", "Shetty", "Gupta",
];
const AREAS = [
  "Indiranagar", "Koramangala", "Jayanagar", "Whitefield", "HSR Layout",
  "Malleshwaram", "Rajajinagar", "Banashankari", "Marathahalli", "BTM Layout",
];

const fullName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
const phone = () => `9${randomInt(100000000, 999999999)}`;

async function clearTransactionalData() {
  // Ordered so that children go before parents; the schema's cascades handle
  // the rest.
  await prisma.$transaction([
    prisma.notificationLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.complaintAttachment.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.processingHistory.deleteMany(),
    prisma.processingTask.deleteMany(),
    prisma.processingBatch.deleteMany(),
    prisma.garmentLocationHistory.deleteMany(),
    prisma.garmentStatusHistory.deleteMany(),
    prisma.garmentPhoto.deleteMany(),
    prisma.garment.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.pickup.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.scanEvent.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.goodsReceiptItem.deleteMany(),
    prisma.goodsReceipt.deleteMany(),
    prisma.supplierPayment.deleteMany(),
    prisma.purchaseInvoice.deleteMany(),
    prisma.purchaseReturnItem.deleteMany(),
    prisma.purchaseReturn.deleteMany(),
    prisma.purchaseOrderItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.inventoryTransaction.deleteMany(),
    prisma.inventoryStock.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.b2BStatement.deleteMany(),
    prisma.b2BRateCard.deleteMany(),
    prisma.b2BSchedule.deleteMany(),
    prisma.b2BContract.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.leave.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.sequence.deleteMany(),
  ]);
}

async function seedPermissions() {
  const codes = Object.values(PERMISSIONS);

  await prisma.$transaction(
    codes.map((code) =>
      prisma.permission.upsert({
        where: { code },
        create: {
          code,
          module: code.split(".")[0],
          description: PERMISSION_DESCRIPTIONS[code] ?? code,
        },
        update: { description: PERMISSION_DESCRIPTIONS[code] ?? code },
      }),
    ),
  );

  const permissions = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const idByCode = new Map(permissions.map((entry) => [entry.code, entry.id]));

  await prisma.rolePermission.deleteMany();
  const rows = Object.entries(ROLE_PERMISSIONS).flatMap(([role, granted]) =>
    granted
      .map((code) => idByCode.get(code))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ role: role as UserRole, permissionId })),
  );

  await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
  console.log(`  ${codes.length} permissions, ${rows.length} role grants`);
}

async function seedSettings() {
  const settings = [
    { key: "app_name", value: "Aura Laundry", category: "general" },
    { key: "gst_rate", value: "18", category: "billing" },
    { key: "default_turnaround_hours", value: "48", category: "operations" },
    { key: "low_stock_alerts", value: "true", category: "inventory" },
  ];

  await prisma.$transaction(
    settings.map((setting) =>
      prisma.setting.upsert({
        where: { key: setting.key },
        create: setting,
        update: {},
      }),
    ),
  );
}

async function seedBranches() {
  const headOffice = await prisma.branch.upsert({
    where: { code: "HO" },
    create: {
      code: "HO",
      name: "Aura Head Office",
      type: "HEAD_OFFICE",
      addressLine: "4th Floor, Prestige Towers, MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
      phone: "08040001000",
      email: "hello@auralaundry.example",
      gstNumber: "29AABCA1234A1Z5",
      openingTime: "09:00",
      closingTime: "19:00",
    },
    update: {},
  });

  const children = [
    {
      code: "BR1",
      name: "Indiranagar Branch",
      type: "BRANCH" as const,
      addressLine: "121, 100 Feet Road, Indiranagar",
      pincode: "560038",
      phone: "08040001001",
    },
    {
      code: "BR2",
      name: "Koramangala Branch",
      type: "BRANCH" as const,
      addressLine: "8th Block, Koramangala",
      pincode: "560095",
      phone: "08040001002",
    },
    {
      code: "CPU",
      name: "Central Processing Unit",
      type: "CENTRAL_PROCESSING_UNIT" as const,
      addressLine: "Plot 44, Peenya Industrial Area",
      pincode: "560058",
      phone: "08040001003",
    },
  ];

  const branches = await Promise.all(
    children.map((child) =>
      prisma.branch.upsert({
        where: { code: child.code },
        create: {
          ...child,
          parentId: headOffice.id,
          city: "Bengaluru",
          state: "Karnataka",
          gstNumber: "29AABCA1234A1Z5",
          openingTime: "08:00",
          closingTime: "21:00",
        },
        update: {},
      }),
    ),
  );

  console.log(`  ${branches.length + 1} branches`);
  return { headOffice, branch1: branches[0], branch2: branches[1], cpu: branches[2] };
}

async function seedShifts(branchIds: string[]) {
  const existing = await prisma.shift.findMany();
  if (existing.length > 0) return existing;

  const shifts = await Promise.all(
    branchIds.flatMap((branchId) => [
      prisma.shift.create({
        data: { name: "Morning", branchId, startTime: "07:00", endTime: "15:00" },
      }),
      prisma.shift.create({
        data: { name: "Evening", branchId, startTime: "14:00", endTime: "22:00" },
      }),
    ]),
  );
  return shifts;
}

interface SeededUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
}

async function seedUsers(branches: {
  headOffice: { id: string };
  branch1: { id: string };
  branch2: { id: string };
  cpu: { id: string };
}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const definitions: {
    employeeCode: string;
    name: string;
    email: string;
    role: UserRole;
    branchId: string | null;
    department?: string;
    designation?: string;
    driver?: { vehicleNumber: string; vehicleType: string; licenseNumber: string };
  }[] = [
    {
      employeeCode: "EMP0001",
      name: "Ravi Anand",
      email: "superadmin@auralaundry.example",
      role: "SUPER_ADMIN",
      branchId: branches.headOffice.id,
      department: "Technology",
      designation: "System Administrator",
    },
    {
      employeeCode: "EMP0002",
      name: "Sunita Rao",
      email: "owner@auralaundry.example",
      role: "OWNER",
      branchId: branches.headOffice.id,
      department: "Leadership",
      designation: "Proprietor",
    },
    {
      employeeCode: "EMP0003",
      name: "Deepak Menon",
      email: "manager@auralaundry.example",
      role: "BRANCH_MANAGER",
      branchId: branches.branch1.id,
      department: "Operations",
      designation: "Branch Manager",
    },
    {
      employeeCode: "EMP0004",
      name: "Rekha Pillai",
      email: "manager2@auralaundry.example",
      role: "BRANCH_MANAGER",
      branchId: branches.branch2.id,
      department: "Operations",
      designation: "Branch Manager",
    },
    {
      employeeCode: "EMP0005",
      name: "Anjali Verma",
      email: "counter@auralaundry.example",
      role: "COUNTER_STAFF",
      branchId: branches.branch1.id,
      department: "Front Desk",
      designation: "Counter Executive",
    },
    {
      employeeCode: "EMP0006",
      name: "Suresh Kumar",
      email: "counter2@auralaundry.example",
      role: "COUNTER_STAFF",
      branchId: branches.branch2.id,
      department: "Front Desk",
      designation: "Counter Executive",
    },
    {
      employeeCode: "EMP0007",
      name: "Mahesh Gowda",
      email: "washing@auralaundry.example",
      role: "WASHING_STAFF",
      branchId: branches.branch1.id,
      department: "Production",
      designation: "Washing Operator",
    },
    {
      employeeCode: "EMP0008",
      name: "Lalita Devi",
      email: "ironing@auralaundry.example",
      role: "IRONING_STAFF",
      branchId: branches.branch1.id,
      department: "Production",
      designation: "Ironing Operator",
    },
    {
      employeeCode: "EMP0009",
      name: "Fatima Sheikh",
      email: "qc@auralaundry.example",
      role: "QC_STAFF",
      branchId: branches.branch1.id,
      department: "Quality",
      designation: "Quality Inspector",
    },
    {
      employeeCode: "EMP0010",
      name: "Joseph Dsouza",
      email: "packing@auralaundry.example",
      role: "PACKING_STAFF",
      branchId: branches.branch1.id,
      department: "Production",
      designation: "Packing Operator",
    },
    {
      employeeCode: "EMP0011",
      name: "Ganesh Naik",
      email: "driver@auralaundry.example",
      role: "DRIVER",
      branchId: branches.branch1.id,
      department: "Logistics",
      designation: "Delivery Executive",
      driver: {
        vehicleNumber: "KA-01-AB-4521",
        vehicleType: "Two wheeler",
        licenseNumber: "KA0120190001234",
      },
    },
    {
      employeeCode: "EMP0012",
      name: "Prakash Shetty",
      email: "driver2@auralaundry.example",
      role: "DRIVER",
      branchId: branches.branch2.id,
      department: "Logistics",
      designation: "Delivery Executive",
      driver: {
        vehicleNumber: "KA-05-CD-9087",
        vehicleType: "Three wheeler",
        licenseNumber: "KA0520180005678",
      },
    },
    {
      employeeCode: "EMP0013",
      name: "Nandini Bhat",
      email: "accountant@auralaundry.example",
      role: "ACCOUNTANT",
      branchId: branches.headOffice.id,
      department: "Finance",
      designation: "Accountant",
    },
    {
      employeeCode: "EMP0014",
      name: "Imtiaz Ali",
      email: "cpu@auralaundry.example",
      role: "WASHING_STAFF",
      branchId: branches.cpu.id,
      department: "Production",
      designation: "Senior Washing Operator",
    },
  ];

  const users: SeededUser[] = [];

  for (const definition of definitions) {
    const user = await prisma.user.upsert({
      where: { email: definition.email },
      create: {
        employeeCode: definition.employeeCode,
        name: definition.name,
        email: definition.email,
        phone: phone(),
        passwordHash,
        role: definition.role,
        branchId: definition.branchId,
        staffProfile: {
          create: {
            department: definition.department,
            designation: definition.designation,
            dateOfJoining: daysAgo(randomInt(120, 900)),
            monthlySalary: randomInt(18, 65) * 1000,
          },
        },
        ...(definition.driver ? { driver: { create: definition.driver } } : {}),
      },
      update: { passwordHash, role: definition.role, branchId: definition.branchId },
      select: { id: true, name: true, email: true, role: true, branchId: true },
    });
    users.push(user);
  }

  // The sequence must not hand out codes that are already taken.
  await prisma.sequence.upsert({
    where: { key: "employee" },
    create: { key: "employee", value: definitions.length },
    update: { value: definitions.length },
  });

  console.log(`  ${users.length} staff accounts (password: ${DEMO_PASSWORD})`);
  return users;
}

async function seedCatalogue() {
  const services = [
    {
      code: "WASH-FOLD",
      name: "Wash & Fold",
      pricingMode: "PER_KG" as const,
      basePrice: 90,
      turnaroundHours: 48,
      stages: ["WASHING", "DRYING", "PACKING"] as ProcessingStage[],
      description: "Everyday laundry charged by weight",
    },
    {
      code: "WASH-IRON",
      name: "Wash & Iron",
      pricingMode: "PER_PIECE" as const,
      basePrice: 35,
      turnaroundHours: 48,
      stages: ["WASHING", "DRYING", "IRONING", "PACKING"] as ProcessingStage[],
      description: "Washed, dried and pressed, charged per garment",
    },
    {
      code: "DRY-CLEAN",
      name: "Dry Cleaning",
      pricingMode: "PER_PIECE" as const,
      basePrice: 120,
      turnaroundHours: 72,
      stages: ["WASHING", "DRYING", "IRONING", "PACKING"] as ProcessingStage[],
      description: "Solvent cleaning for delicate and formal wear",
    },
    {
      code: "IRON-ONLY",
      name: "Steam Ironing",
      pricingMode: "PER_PIECE" as const,
      basePrice: 15,
      turnaroundHours: 24,
      stages: ["IRONING", "PACKING"] as ProcessingStage[],
      description: "Pressing only, no wash",
    },
    {
      code: "PREMIUM",
      name: "Premium Care",
      pricingMode: "PER_PIECE" as const,
      basePrice: 220,
      turnaroundHours: 96,
      // Premium is the one route that still runs a formal QC step.
      stages: [
        "WASHING",
        "DRYING",
        "IRONING",
        "QUALITY_CHECK",
        "PACKING",
      ] as ProcessingStage[],
      description: "Hand finishing for sarees, suits and couture",
    },
  ];

  const garmentTypes = [
    { code: "SHIRT", name: "Shirt", category: "UPPER_WEAR" },
    { code: "TSHIRT", name: "T-Shirt", category: "UPPER_WEAR" },
    { code: "PANT", name: "Trousers", category: "LOWER_WEAR" },
    { code: "JEANS", name: "Jeans", category: "LOWER_WEAR" },
    { code: "SAREE", name: "Saree", category: "ETHNIC" },
    { code: "KURTA", name: "Kurta", category: "ETHNIC" },
    { code: "SUIT", name: "Suit", category: "FORMAL" },
    { code: "BLAZER", name: "Blazer", category: "FORMAL" },
    { code: "DRESS", name: "Dress", category: "UPPER_WEAR" },
    { code: "BEDSHEET", name: "Bedsheet", category: "LINEN" },
    { code: "TOWEL", name: "Towel", category: "LINEN" },
    { code: "CURTAIN", name: "Curtain", category: "HOME" },
    { code: "PILLOWCOVER", name: "Pillow Cover", category: "LINEN" },
    { code: "JACKET", name: "Jacket", category: "OUTER_WEAR" },
  ];

  const createdServices = await Promise.all(
    services.map((service) =>
      prisma.service.upsert({
        where: { code: service.code },
        create: service,
        update: { basePrice: service.basePrice, stages: service.stages },
      }),
    ),
  );

  const createdTypes = await Promise.all(
    garmentTypes.map((type) =>
      prisma.garmentType.upsert({
        where: { code: type.code },
        create: type,
        update: {},
      }),
    ),
  );

  // A rate matrix — garment-specific prices beat the service base price.
  const multipliers: Record<string, number> = {
    SHIRT: 1, TSHIRT: 0.9, PANT: 1.2, JEANS: 1.4, SAREE: 2.2, KURTA: 1.1,
    SUIT: 3, BLAZER: 2.4, DRESS: 1.6, BEDSHEET: 1.8, TOWEL: 0.7,
    CURTAIN: 2.6, PILLOWCOVER: 0.5, JACKET: 2,
  };

  const rates = createdServices
    .filter((service) => service.pricingMode !== "PER_KG")
    .flatMap((service) =>
      createdTypes.map((type) => ({
        serviceId: service.id,
        garmentTypeId: type.id,
        price: round2(Number(service.basePrice) * (multipliers[type.code] ?? 1)),
      })),
    );

  await prisma.serviceRate.createMany({ data: rates, skipDuplicates: true });

  console.log(
    `  ${createdServices.length} services, ${createdTypes.length} garment types, ${rates.length} rates`,
  );
  return { services: createdServices, garmentTypes: createdTypes };
}

async function seedRacks(branchIds: { id: string; code: string }[]) {
  const existing = await prisma.rack.count();
  if (existing > 0) {
    return prisma.rackSlot.findMany({ include: { rack: true } });
  }

  for (const branch of branchIds) {
    for (const [index, rackCode] of ["A", "B", "C"].entries()) {
      const rack = await prisma.rack.create({
        data: {
          branchId: branch.id,
          code: rackCode,
          name:
            index === 0
              ? "Ready for collection"
              : index === 1
                ? "Awaiting delivery"
                : "Long-stay storage",
          description: `Rack ${rackCode} at ${branch.code}`,
        },
      });

      await prisma.rackSlot.createMany({
        data: Array.from({ length: 20 }, (_, slotIndex) => ({
          rackId: rack.id,
          code: `${rackCode}${String(slotIndex + 1).padStart(2, "0")}`,
          capacity: 20,
        })),
      });
    }
  }

  const slots = await prisma.rackSlot.findMany({ include: { rack: true } });
  console.log(`  ${slots.length} rack slots across ${branchIds.length} branches`);
  return slots;
}

async function seedInventory(branchIds: string[]) {
  const items = [
    { sku: "DET-001", name: "Industrial Detergent Powder", category: "DETERGENT" as const, unit: "kg", minStockLevel: 50, costPrice: 120 },
    { sku: "DET-002", name: "Liquid Detergent Concentrate", category: "DETERGENT" as const, unit: "L", minStockLevel: 40, costPrice: 210 },
    { sku: "BLC-001", name: "Oxygen Bleach", category: "BLEACH" as const, unit: "L", minStockLevel: 20, costPrice: 180 },
    { sku: "SOF-001", name: "Fabric Softener — Lavender", category: "FABRIC_SOFTENER" as const, unit: "L", minStockLevel: 30, costPrice: 160 },
    { sku: "STN-001", name: "Enzyme Stain Remover", category: "STAIN_REMOVER" as const, unit: "L", minStockLevel: 15, costPrice: 340 },
    { sku: "CHM-001", name: "Perchloroethylene (Dry Clean)", category: "CHEMICAL" as const, unit: "L", minStockLevel: 25, costPrice: 480 },
    { sku: "PKG-001", name: "Poly Garment Cover — Large", category: "PACKAGING" as const, unit: "pcs", minStockLevel: 500, costPrice: 4 },
    { sku: "PKG-002", name: "Kraft Paper Bag", category: "PACKAGING" as const, unit: "pcs", minStockLevel: 300, costPrice: 9 },
    { sku: "HNG-001", name: "Wire Hanger", category: "HANGER" as const, unit: "pcs", minStockLevel: 400, costPrice: 6 },
    { sku: "HNG-002", name: "Wooden Suit Hanger", category: "HANGER" as const, unit: "pcs", minStockLevel: 100, costPrice: 48 },
    { sku: "COV-001", name: "Suit Cover", category: "COVER" as const, unit: "pcs", minStockLevel: 120, costPrice: 22 },
    { sku: "TAG-001", name: "Garment Tag Roll", category: "TAG" as const, unit: "roll", minStockLevel: 20, costPrice: 260 },
    { sku: "LBL-001", name: "Barcode Label Sheet", category: "LABEL" as const, unit: "sheet", minStockLevel: 50, costPrice: 35 },
  ];

  const created = await Promise.all(
    items.map((item) =>
      prisma.inventoryItem.upsert({
        where: { sku: item.sku },
        create: item,
        update: {},
      }),
    ),
  );

  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });

  for (const branchId of branchIds) {
    for (const item of created) {
      // A couple of items are deliberately left below their minimum so the
      // low-stock alerting has something real to show.
      const belowMinimum = ["STN-001", "HNG-002"].includes(item.sku);
      const quantity = belowMinimum
        ? round2(Number(item.minStockLevel) * 0.4)
        : round2(Number(item.minStockLevel) * (1.5 + random() * 2));

      await prisma.inventoryStock.upsert({
        where: { itemId_branchId: { itemId: item.id, branchId } },
        create: { itemId: item.id, branchId, quantity },
        update: { quantity },
      });

      await prisma.inventoryTransaction.create({
        data: {
          itemId: item.id,
          branchId,
          type: "STOCK_IN",
          quantity,
          balanceAfter: quantity,
          unitCost: Number(item.costPrice),
          reference: "Opening stock",
          userId: admin?.id,
          createdAt: daysAgo(45),
        },
      });
    }
  }

  console.log(`  ${created.length} inventory items stocked at ${branchIds.length} branches`);
  return created;
}

async function seedSuppliers(
  branchId: string,
  items: { id: string; sku: string; costPrice: unknown }[],
  createdById: string,
) {
  const suppliers = await Promise.all(
    [
      {
        code: "SUP-001",
        name: "Karnataka Chemicals & Detergents",
        contactPerson: "Mohan Rao",
        phone: "9845012345",
        email: "sales@kcd.example",
        gstNumber: "29AAACK1234B1Z9",
        paymentTerms: "Net 30",
        creditDays: 30,
      },
      {
        code: "SUP-002",
        name: "Bengaluru Packaging Supplies",
        contactPerson: "Vidya Hegde",
        phone: "9845067890",
        email: "orders@bps.example",
        gstNumber: "29AAACB5678C1Z2",
        paymentTerms: "Net 15",
        creditDays: 15,
      },
    ].map((supplier) =>
      prisma.supplier.upsert({
        where: { code: supplier.code },
        create: supplier,
        update: {},
      }),
    ),
  );

  const poItems = items.slice(0, 4).map((item) => {
    const quantity = randomInt(40, 160);
    const unitPrice = Number(item.costPrice);
    const base = round2(quantity * unitPrice);
    return {
      itemId: item.id,
      quantity,
      unitPrice,
      taxRate: 18,
      lineTotal: round2(base * 1.18),
      base,
    };
  });

  const subtotal = round2(poItems.reduce((sum, item) => sum + item.base, 0));
  const taxAmount = round2(subtotal * 0.18);

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO00001",
      supplierId: suppliers[0].id,
      branchId,
      status: "RECEIVED",
      orderDate: daysAgo(20),
      expectedDate: daysAgo(14),
      subtotal,
      taxAmount,
      total: round2(subtotal + taxAmount),
      createdById,
      items: {
        create: poItems.map(({ base: _base, ...item }) => ({
          ...item,
          receivedQuantity: item.quantity,
        })),
      },
    },
  });

  await prisma.goodsReceipt.create({
    data: {
      grnNumber: "GRN00001",
      poId: po.id,
      branchId,
      receivedAt: daysAgo(14),
      receivedById: createdById,
      items: {
        create: poItems.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      },
    },
  });

  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: po.poNumber,
      supplierId: suppliers[0].id,
      poId: po.id,
      invoiceDate: daysAgo(14),
      dueDate: daysAgo(-16),
      subtotal,
      taxAmount,
      total: round2(subtotal + taxAmount),
      amountPaid: round2((subtotal + taxAmount) * 0.5),
      status: "PARTIALLY_PAID",
    },
  });

  await prisma.supplierPayment.create({
    data: {
      paymentNumber: "SPY00001",
      supplierId: suppliers[0].id,
      invoiceId: invoice.id,
      amount: round2((subtotal + taxAmount) * 0.5),
      method: "BANK_TRANSFER",
      reference: "NEFT/2026/0041",
      paidAt: daysAgo(7),
      paidById: createdById,
    },
  });

  // A second, still-open order so the purchases screen shows work in flight.
  const openItems = items.slice(4, 7).map((item) => {
    const quantity = randomInt(50, 200);
    const unitPrice = Number(item.costPrice);
    return {
      itemId: item.id,
      quantity,
      unitPrice,
      taxRate: 18,
      lineTotal: round2(quantity * unitPrice * 1.18),
    };
  });
  const openSubtotal = round2(
    openItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  );

  await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO00002",
      supplierId: suppliers[1].id,
      branchId,
      status: "SENT",
      orderDate: daysAgo(3),
      expectedDate: daysAgo(-4),
      subtotal: openSubtotal,
      taxAmount: round2(openSubtotal * 0.18),
      total: round2(openSubtotal * 1.18),
      createdById,
      items: { create: openItems },
    },
  });

  await prisma.sequence.upsert({
    where: { key: "purchase_order" },
    create: { key: "purchase_order", value: 2 },
    update: { value: 2 },
  });
  await prisma.sequence.upsert({
    where: { key: "goods_receipt" },
    create: { key: "goods_receipt", value: 1 },
    update: { value: 1 },
  });
  await prisma.sequence.upsert({
    where: { key: "supplier_payment" },
    create: { key: "supplier_payment", value: 1 },
    update: { value: 1 },
  });

  console.log(`  ${suppliers.length} suppliers, 2 purchase orders`);
  return suppliers;
}

async function seedB2B(
  branchId: string,
  services: { id: string; code: string }[],
  garmentTypes: { id: string; code: string }[],
) {
  const accounts = [
    {
      code: "HTL-001",
      businessName: "The Grand Orchid Hotel",
      type: "HOTEL" as const,
      contactPerson: "Ashok Menon",
      phone: "9880011223",
      email: "housekeeping@grandorchid.example",
      billingAddress: "12 Residency Road, Bengaluru 560025",
      gstNumber: "29AAACG7788D1Z4",
      creditLimit: 200000,
      creditDays: 30,
      paymentTerms: "Monthly billing, net 30",
    },
    {
      code: "HSP-001",
      businessName: "Sunrise Multispeciality Hospital",
      type: "HOSPITAL" as const,
      contactPerson: "Dr. Latha Krishnan",
      phone: "9880033445",
      email: "admin@sunrisehospital.example",
      billingAddress: "Sarjapur Road, Bengaluru 560035",
      gstNumber: "29AAACS9911E1Z7",
      creditLimit: 350000,
      creditDays: 45,
      paymentTerms: "Fortnightly billing, net 45",
    },
    {
      code: "GYM-001",
      businessName: "IronCore Fitness",
      type: "GYM" as const,
      contactPerson: "Nikhil Bose",
      phone: "9880055667",
      email: "ops@ironcore.example",
      billingAddress: "HSR Layout Sector 2, Bengaluru 560102",
      creditLimit: 60000,
      creditDays: 15,
      paymentTerms: "Weekly billing",
    },
  ];

  const created = await Promise.all(
    accounts.map((account) =>
      prisma.b2BAccount.upsert({
        where: { code: account.code },
        create: { ...account, branchId },
        update: {},
      }),
    ),
  );

  const washFold = services.find((service) => service.code === "WASH-FOLD");
  const washIron = services.find((service) => service.code === "WASH-IRON");
  const bedsheet = garmentTypes.find((type) => type.code === "BEDSHEET");
  const towel = garmentTypes.find((type) => type.code === "TOWEL");

  for (const [index, account] of created.entries()) {
    const contract = await prisma.b2BContract.create({
      data: {
        contractNumber: `CNT${String(index + 1).padStart(5, "0")}`,
        accountId: account.id,
        status: "ACTIVE",
        billingCycle: index === 1 ? "FORTNIGHTLY" : index === 2 ? "WEEKLY" : "MONTHLY",
        startDate: daysAgo(180),
        minimumMonthlyValue: [50000, 90000, 15000][index],
        terms:
          "Daily pickup at 08:00, 24-hour turnaround on linen. Damages reported within 24 hours of delivery.",
      },
    });

    const rateCards = [
      washFold && {
        contractId: contract.id,
        serviceId: washFold.id,
        garmentTypeId: null,
        pricingMode: "PER_KG" as const,
        rate: [62, 55, 70][index],
        effectiveFrom: daysAgo(180),
      },
      washIron &&
        bedsheet && {
          contractId: contract.id,
          serviceId: washIron.id,
          garmentTypeId: bedsheet.id,
          pricingMode: "PER_PIECE" as const,
          rate: [42, 38, 48][index],
          effectiveFrom: daysAgo(180),
        },
      washIron &&
        towel && {
          contractId: contract.id,
          serviceId: washIron.id,
          garmentTypeId: towel.id,
          pricingMode: "PER_PIECE" as const,
          rate: [16, 14, 18][index],
          effectiveFrom: daysAgo(180),
        },
    ].filter(Boolean) as {
      contractId: string;
      serviceId: string;
      garmentTypeId: string | null;
      pricingMode: "PER_KG" | "PER_PIECE";
      rate: number;
      effectiveFrom: Date;
    }[];

    await prisma.b2BRateCard.createMany({ data: rateCards, skipDuplicates: true });

    await prisma.b2BSchedule.createMany({
      data: [
        {
          accountId: account.id,
          type: "PICKUP",
          dayOfWeek: 1,
          timeSlot: "08:00 – 09:00",
        },
        {
          accountId: account.id,
          type: "DELIVERY",
          dayOfWeek: 3,
          timeSlot: "17:00 – 19:00",
        },
      ],
    });
  }

  await prisma.sequence.upsert({
    where: { key: "contract" },
    create: { key: "contract", value: created.length },
    update: { value: created.length },
  });

  console.log(`  ${created.length} corporate accounts with contracts and rate cards`);
  return created;
}

async function seedNotificationTemplates() {
  const templates = [
    { event: "ORDER_RECEIVED", name: "Order received", channel: "IN_APP" },
    { event: "ORDER_READY", name: "Order ready", channel: "IN_APP" },
    { event: "OUT_FOR_DELIVERY", name: "Out for delivery", channel: "IN_APP" },
    { event: "DELIVERED", name: "Delivered", channel: "IN_APP" },
    { event: "PAYMENT_RECEIVED", name: "Payment received", channel: "IN_APP" },
    { event: "PAYMENT_REMINDER", name: "Payment reminder", channel: "IN_APP" },
    { event: "ORDER_DELAYED", name: "Order delayed", channel: "IN_APP" },
    { event: "PICKUP_SCHEDULED", name: "Pickup scheduled", channel: "IN_APP" },
    { event: "COMPLAINT_REGISTERED", name: "Complaint registered", channel: "EMAIL" },
    { event: "COMPLAINT_RESOLVED", name: "Complaint resolved", channel: "EMAIL" },
  ] as const;

  await Promise.all(
    templates.map((template) =>
      prisma.notificationTemplate.upsert({
        where: { code: `${template.event.toLowerCase()}_${template.channel.toLowerCase()}` },
        create: {
          code: `${template.event.toLowerCase()}_${template.channel.toLowerCase()}`,
          name: template.name,
          channel: template.channel,
          event: template.event,
          subject:
            template.channel === "EMAIL" ? `${template.name} — {{orderNumber}}` : null,
          body: DEFAULT_NOTIFICATION_BODIES[template.event],
        },
        update: {},
      }),
    ),
  );

  // Templates are configuration rather than transactional data, so they are not
  // cleared with everything else — retire any that are no longer in the list.
  await prisma.notificationTemplate.deleteMany({
    where: {
      code: {
        notIn: templates.map(
          (template) => `${template.event.toLowerCase()}_${template.channel.toLowerCase()}`,
        ),
      },
    },
  });

  console.log(`  ${templates.length} notification templates`);
}

/** A customer as the order seeder needs it: enough to fill an order's snapshot. */
interface DirectoryEntry {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  pincode: string | null;
}

interface OrderPlan {
  /** How far the order should have progressed, as a fraction of the pipeline. */
  progress: "fresh" | "mid" | "ready" | "delivered" | "delayed";
}

async function seedOrders(context: {
  branches: { id: string; code: string }[];
  services: { id: string; code: string; pricingMode: string; basePrice: unknown; stages: string[]; turnaroundHours: number }[];
  garmentTypes: { id: string; code: string; name: string }[];
  users: SeededUser[];
  slots: { id: string; code: string; rackId: string }[];
  b2bAccounts: { id: string; code: string; businessName: string; phone: string }[];
}) {
  const { branches, services, garmentTypes, users, slots, b2bAccounts } = context;

  const counter = users.find((user) => user.role === "COUNTER_STAFF")!;
  const washer = users.find((user) => user.role === "WASHING_STAFF")!;
  const ironer = users.find((user) => user.role === "IRONING_STAFF")!;
  const qc = users.find((user) => user.role === "QC_STAFF")!;
  const packer = users.find((user) => user.role === "PACKING_STAFF")!;
  const drivers = await prisma.driver.findMany({ include: { user: true } });

  const rates = await prisma.serviceRate.findMany();
  const rateKey = (serviceId: string, garmentTypeId: string) =>
    `${serviceId}:${garmentTypeId}`;
  const rateMap = new Map(
    rates.map((rate) => [rateKey(rate.serviceId, rate.garmentTypeId), Number(rate.price)]),
  );

  const STAGE_ORDER: ProcessingStage[] = [
    "SORTING", "WASHING", "DRYING", "IRONING", "QUALITY_CHECK", "PACKING",
  ];

  const operatorFor: Record<string, SeededUser> = {
    SORTING: counter,
    WASHING: washer,
    DRYING: washer,
    IRONING: ironer,
    QUALITY_CHECK: qc,
    PACKING: packer,
  };

  const doneStatus: Record<string, GarmentStatus> = {
    SORTING: "SORTED",
    WASHING: "WASHED",
    DRYING: "DRIED",
    IRONING: "IRONED",
    QUALITY_CHECK: "QC_PASSED",
    PACKING: "PACKED",
  };

  const plans: OrderPlan[] = [
    ...Array.from({ length: 8 }, () => ({ progress: "fresh" as const })),
    ...Array.from({ length: 12 }, () => ({ progress: "mid" as const })),
    ...Array.from({ length: 10 }, () => ({ progress: "ready" as const })),
    ...Array.from({ length: 14 }, () => ({ progress: "delivered" as const })),
    ...Array.from({ length: 4 }, () => ({ progress: "delayed" as const })),
  ];

  let orderCounter = 0;
  let garmentCounter = 0;
  let invoiceCounter = 0;
  let paymentCounter = 0;
  let deliveryCounter = 0;
  let pickupCounter = 0;
  const slotOccupancy = new Map<string, number>();
  const createdOrders: { id: string; orderNumber: string; branchId: string }[] = [];

  // A directory per branch, sized so roughly half the orders land on a repeat
  // customer — which is what makes the repeat badge and lifetime totals mean
  // something on the customer screens.
  let customerCounter = 0;
  const directory = new Map<string, DirectoryEntry[]>();

  for (const branch of branches.filter((entry) => entry.code !== "HO")) {
    const entries: DirectoryEntry[] = [];
    for (let index = 0; index < 14; index += 1) {
      customerCounter += 1;
      const name = fullName();
      const area = pick(AREAS);
      const record = await prisma.customer.create({
        data: {
          code: `CUS${10000 + customerCounter}`,
          branchId: branch.id,
          name,
          phone: phone().replace(/\D/g, "").slice(-10),
          email:
            random() < 0.55
              ? `${name.split(" ")[0].toLowerCase()}${randomInt(10, 99)}@example.com`
              : null,
          addressLine: `${randomInt(1, 400)}, ${randomInt(1, 12)}th Cross, ${area}`,
          city: "Bengaluru",
          pincode: `5600${randomInt(10, 99)}`,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          addressLine: true,
          city: true,
          pincode: true,
        },
      });
      entries.push(record);
    }
    directory.set(branch.id, entries);
  }

  const b2bCustomers = new Map<string, DirectoryEntry>();

  for (const plan of plans) {
    orderCounter += 1;

    const branch = pick(branches.filter((entry) => entry.code !== "HO"));
    const isB2B = random() < 0.18 && b2bAccounts.length > 0;
    const account = isB2B ? pick(b2bAccounts) : null;

    const ageDays =
      plan.progress === "delivered"
        ? randomInt(3, 28)
        : plan.progress === "delayed"
          ? randomInt(5, 12)
          : plan.progress === "ready"
            ? randomInt(1, 3)
            : randomInt(0, 2);

    const placedAt = daysAgo(ageDays, randomInt(9, 18));
    const orderType = pick(["WALK_IN", "WALK_IN", "PICKUP", "DELIVERY"] as const);

    // Build line items.
    const lineCount = randomInt(1, 3);
    const lines = Array.from({ length: lineCount }, () => {
      const service = pick(services);
      const garmentType = pick(garmentTypes);
      const quantity = service.pricingMode === "PER_KG" ? randomInt(4, 12) : randomInt(1, 6);
      const weightKg =
        service.pricingMode === "PER_KG" ? round2(quantity * (0.35 + random() * 0.4)) : 0;
      const unitPrice =
        service.pricingMode === "PER_KG"
          ? Number(service.basePrice)
          : (rateMap.get(rateKey(service.id, garmentType.id)) ?? Number(service.basePrice));
      const billable = service.pricingMode === "PER_KG" ? weightKg : quantity;

      return {
        service,
        garmentType,
        quantity,
        weightKg,
        unitPrice,
        lineTotal: round2(unitPrice * billable),
      };
    });

    const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const discountAmount = random() < 0.2 ? round2(subtotal * 0.1) : 0;
    const taxableAmount = round2(subtotal - discountAmount);
    const gstAmount = round2(taxableAmount * 0.18);
    const totalAmount = round2(taxableAmount + gstAmount);
    const totalPieces = lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalWeightKg = round2(lines.reduce((sum, line) => sum + line.weightKg, 0));

    const turnaround = Math.max(...lines.map((line) => line.service.turnaroundHours));
    const expectedDeliveryAt =
      plan.progress === "delayed"
        ? hoursFrom(placedAt, 24)
        : hoursFrom(placedAt, turnaround);

    const paid =
      plan.progress === "delivered"
        ? totalAmount
        : random() < 0.45
          ? round2(totalAmount * (random() < 0.5 ? 0.3 : 0.5))
          : 0;
    const outstanding = round2(totalAmount - paid);

    let customer: DirectoryEntry;
    if (account) {
      const cached = b2bCustomers.get(`${branch.id}:${account.id}`);
      customer =
        cached ??
        (await prisma.customer.create({
          data: {
            code: `CUS${10000 + (customerCounter += 1)}`,
            branchId: branch.id,
            name: account.businessName,
            phone: account.phone.replace(/\D/g, "").slice(-10),
            addressLine: `${randomInt(1, 400)}, ${randomInt(1, 12)}th Cross, ${pick(AREAS)}`,
            city: "Bengaluru",
            pincode: `5600${randomInt(10, 99)}`,
          },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            addressLine: true,
            city: true,
            pincode: true,
          },
        }));
      b2bCustomers.set(`${branch.id}:${account.id}`, customer);
    } else {
      customer = pick(directory.get(branch.id) ?? []);
    }

    const customerName = customer.name;
    const customerPhone = customer.phone;

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD${10000 + orderCounter}`,
        branchId: branch.id,
        type: orderType,
        priority: random() < 0.15 ? "EXPRESS" : "NORMAL",
        status: "RECEIVED",
        paymentStatus:
          paid <= 0 ? "UNPAID" : paid >= totalAmount ? "PAID" : "PARTIALLY_PAID",
        customerId: customer.id,
        customerName,
        customerPhone,
        customerEmail: customer.email,
        addressLine: customer.addressLine,
        city: customer.city,
        pincode: customer.pincode,
        b2bAccountId: account?.id ?? null,
        placedAt,
        expectedDeliveryAt,
        subtotal,
        discountAmount,
        discountReason: discountAmount > 0 ? "Loyalty discount" : null,
        taxableAmount,
        gstRate: 18,
        gstAmount,
        totalAmount,
        paidAmount: paid,
        outstandingAmount: outstanding,
        totalPieces,
        totalWeightKg,
        specialInstructions: random() < 0.3 ? "No starch, hang dry only" : null,
        stainNotes: random() < 0.25 ? "Coffee mark on the front panel" : null,
        createdById: counter.id,
        createdAt: placedAt,
        items: {
          create: lines.map((line) => ({
            serviceId: line.service.id,
            garmentTypeId: line.garmentType.id,
            quantity: line.quantity,
            weightKg: line.weightKg,
            pricingMode: line.service.pricingMode as never,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        },
        statusHistory: {
          create: {
            toStatus: "RECEIVED",
            userId: counter.id,
            userName: counter.name,
            note: "Order booked at counter",
            createdAt: placedAt,
          },
        },
      },
      include: { items: true },
    });

    createdOrders.push({
      id: order.id,
      orderNumber: order.orderNumber,
      branchId: branch.id,
    });

    // Invoice
    invoiceCounter += 1;
    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV${String(invoiceCounter).padStart(6, "0")}`,
        type: "ORDER",
        status: paid >= totalAmount ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
        branchId: branch.id,
        orderId: order.id,
        b2bAccountId: account?.id ?? null,
        billToName: customerName,
        billToPhone: customerPhone,
        subtotal,
        discountAmount,
        taxableAmount,
        gstRate: 18,
        cgstAmount: round2(gstAmount / 2),
        sgstAmount: round2(gstAmount - round2(gstAmount / 2)),
        totalAmount,
        amountPaid: paid,
        amountDue: outstanding,
        issuedAt: placedAt,
        dueAt: expectedDeliveryAt,
        issuedById: counter.id,
        lines: {
          create: order.items.map((item, index) => ({
            orderId: order.id,
            description: `${lines[index].service.code} — ${lines[index].garmentType.name}`,
            quantity:
              lines[index].service.pricingMode === "PER_KG"
                ? lines[index].weightKg
                : item.quantity,
            unitPrice: lines[index].unitPrice,
            lineTotal: lines[index].lineTotal,
          })),
        },
      },
    });

    if (paid > 0) {
      paymentCounter += 1;
      await prisma.payment.create({
        data: {
          paymentNumber: `PAY${String(paymentCounter).padStart(6, "0")}`,
          branchId: branch.id,
          orderId: order.id,
          amount: paid,
          method: pick(["CASH", "UPI", "CARD", "ONLINE"] as const),
          provider: "MANUAL",
          state: "CAPTURED",
          isAdvance: paid < totalAmount,
          paidAt:
            plan.progress === "delivered"
              ? progressedTo(placedAt, turnaround)
              : placedAt,
          receivedById: counter.id,
        },
      });
    }

    if (orderType === "PICKUP") {
      pickupCounter += 1;
      await prisma.pickup.create({
        data: {
          pickupNumber: `PCK${String(pickupCounter).padStart(6, "0")}`,
          orderId: order.id,
          branchId: branch.id,
          status: plan.progress === "fresh" ? "DRIVER_ASSIGNED" : "RECEIVED_AT_LAUNDRY",
          driverId: drivers.length ? pick(drivers).id : null,
          scheduledAt: placedAt,
          receivedAt: plan.progress === "fresh" ? null : progressedTo(placedAt, 2),
          contactName: customerName,
          contactPhone: customerPhone,
          addressLine: order.addressLine ?? "",
        },
      });
    }

    // -----------------------------------------------------------------------
    // Garments, tasks and their history.
    // -----------------------------------------------------------------------
    const pipelineFor = (stages: string[]) =>
      STAGE_ORDER.filter((stage) => stages.includes(stage) || stage === "PACKING");

    const targetIndexFor = (pipeline: ProcessingStage[]) => {
      switch (plan.progress) {
        case "fresh":
          return randomInt(0, 1);
        case "mid":
        case "delayed":
          return randomInt(1, Math.max(1, pipeline.length - 2));
        case "ready":
        case "delivered":
          return pipeline.length;
      }
    };

    const orderSlot =
      plan.progress === "ready"
        ? slots.filter((slot) => {
            const used = slotOccupancy.get(slot.id) ?? 0;
            return used < 12;
          })[randomInt(0, 9)] ?? slots[0]
        : null;

    let laggardStage: ProcessingStage = "DISPATCH";
    let laggardRank = STAGE_ORDER.length;
    let laggardStatus: GarmentStatus = "RECEIVED";

    for (const [lineIndex, item] of order.items.entries()) {
      const line = lines[lineIndex];
      const pipeline = pipelineFor(line.service.stages);
      const target = targetIndexFor(pipeline);

      // Garments in one order move together, give or take a station. The floor
      // keeps a single straggler from dragging the whole order's status back to
      // sorting, which is what makes an in-progress order look believable.
      const floor =
        plan.progress === "fresh"
          ? 0
          : Math.max(1, Math.min(target, target - 1));

      for (let piece = 0; piece < item.quantity; piece += 1) {
        garmentCounter += 1;
        const code = `G${1000 + garmentCounter}`;

        const completed = Math.min(pipeline.length, randomInt(floor, target));

        const history: {
          toStatus: GarmentStatus;
          fromStatus: GarmentStatus | null;
          stage: ProcessingStage;
          userId: string;
          userName: string;
          createdAt: Date;
          note: string | null;
        }[] = [
          {
            toStatus: "RECEIVED",
            fromStatus: null,
            stage: "RECEIVING",
            userId: counter.id,
            userName: counter.name,
            createdAt: placedAt,
            note: "Garment received at counter",
          },
        ];

        let currentStatus: GarmentStatus = "RECEIVED";
        let currentStage: ProcessingStage = "RECEIVING";
        let cursor = placedAt;

        const tasks = pipeline.map((stage, index) => {
          const operator = operatorFor[stage];
          const isDone = index < completed;
          const isActive = index === completed && plan.progress !== "delivered";

          if (isDone) {
            cursor = progressedTo(cursor, 1 + random() * 5);
            const finished = doneStatus[stage];
            history.push({
              fromStatus: currentStatus,
              toStatus: finished,
              stage,
              userId: operator.id,
              userName: operator.name,
              createdAt: cursor,
              note: null,
            });
            currentStatus = finished;
            currentStage = stage;
          } else if (isActive) {
            currentStage = stage;
          }

          return {
            stage,
            sequence: index,
            status: isDone
              ? stage === "QUALITY_CHECK"
                ? ("PASSED" as const)
                : ("COMPLETED" as const)
              : isActive
                ? ("PENDING" as const)
                : ("PENDING" as const),
            branchId: branch.id,
            assignedToId: isDone ? operator.id : null,
            startedAt: isDone ? cursor : null,
            completedAt: isDone ? cursor : null,
            durationSeconds: isDone ? randomInt(240, 3600) : null,
          };
        });

        let rackSlotId: string | null = null;

        if (plan.progress === "ready" && orderSlot) {
          rackSlotId = orderSlot.id;
          slotOccupancy.set(orderSlot.id, (slotOccupancy.get(orderSlot.id) ?? 0) + 1);
          cursor = progressedTo(cursor, 0.5);
          history.push({
            fromStatus: currentStatus,
            toStatus: "READY",
            stage: "PACKING",
            userId: packer.id,
            userName: packer.name,
            createdAt: cursor,
            note: `Filed to slot ${orderSlot.code}`,
          });
          currentStatus = "READY";
          currentStage = "PACKING";
        }

        if (plan.progress === "delivered") {
          cursor = progressedTo(cursor, 2);
          history.push({
            fromStatus: currentStatus,
            toStatus: "DELIVERED",
            stage: "DISPATCH",
            userId: drivers.length ? drivers[0].userId : counter.id,
            userName: drivers.length ? drivers[0].user.name : counter.name,
            createdAt: cursor,
            note: "Handed to customer",
          });
          currentStatus = "DELIVERED";
          currentStage = "DISPATCH";
        }

        const garment = await prisma.garment.create({
          data: {
            garmentCode: code,
            qrPayload: `AURA:G:${code}`,
            barcodeValue: code,
            orderId: order.id,
            orderItemId: item.id,
            garmentTypeId: item.garmentTypeId,
            serviceId: item.serviceId,
            branchId: branch.id,
            status: currentStatus,
            currentStage,
            color: pick(["White", "Blue", "Black", "Beige", "Maroon", "Grey"]),
            rackSlotId,
            lastScannedAt: cursor,
            lastScannedById: operatorFor[currentStage] ? operatorFor[currentStage].id : counter.id,
            deliveredAt: plan.progress === "delivered" ? cursor : null,
            createdAt: placedAt,
            statusHistory: {
              create: history.map((entry) => ({
                fromStatus: entry.fromStatus,
                toStatus: entry.toStatus,
                stage: entry.stage,
                branchId: branch.id,
                userId: entry.userId,
                userName: entry.userName,
                note: entry.note,
                createdAt: entry.createdAt,
              })),
            },
            tasks: { create: tasks },
          },
          select: { id: true },
        });

        if (rackSlotId) {
          await prisma.garmentLocationHistory.create({
            data: {
              garmentId: garment.id,
              toSlotId: rackSlotId,
              branchId: branch.id,
              userId: packer.id,
              userName: packer.name,
              note: "Filed after packing",
              createdAt: cursor,
            },
          });
        }

        // Track the station the slowest garment is queued at, exactly as
        // recomputeOrderStatus does at runtime.
        const waitingAt: ProcessingStage =
          completed < pipeline.length ? pipeline[completed] : "DISPATCH";
        const rank = STAGE_ORDER.indexOf(waitingAt);
        if (rank < laggardRank) {
          laggardRank = rank;
          laggardStage = waitingAt;
          laggardStatus = currentStatus;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Order header status, derived from where its garments actually are.
    // -----------------------------------------------------------------------
    const STATUS_FOR_STAGE: Record<string, OrderStatus> = {
      RECEIVING: "RECEIVED",
      SORTING: "SORTING",
      WASHING: "WASHING",
      DRYING: "DRYING",
      IRONING: "IRONING",
      QUALITY_CHECK: "QUALITY_CHECK",
      PACKING: "PACKING",
      DISPATCH: "OUT_FOR_DELIVERY",
    };

    const orderStatus: OrderStatus =
      plan.progress === "delivered"
        ? "DELIVERED"
        : plan.progress === "ready"
          ? "READY"
          : laggardStatus === "RECEIVED" && laggardStage === "SORTING"
            ? "RECEIVED"
            : (STATUS_FOR_STAGE[laggardStage as string] ?? "SORTING");

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: orderStatus,
        rackSlotId: orderSlot?.id ?? null,
        readyAt:
          plan.progress === "ready" || plan.progress === "delivered"
            ? progressedTo(placedAt, turnaround - 4)
            : null,
        deliveredAt:
          plan.progress === "delivered" ? progressedTo(placedAt, turnaround) : null,
      },
    });

    if (orderStatus !== "RECEIVED") {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "RECEIVED",
          toStatus: orderStatus,
          userId: counter.id,
          userName: counter.name,
          note: "Derived from garment progress",
          createdAt: progressedTo(placedAt, 3),
        },
      });
    }

    // Deliveries for anything ready or already handed over.
    if (
      (plan.progress === "ready" || plan.progress === "delivered") &&
      drivers.length > 0
    ) {
      deliveryCounter += 1;
      const driver = pick(drivers);
      await prisma.delivery.create({
        data: {
          deliveryNumber: `DLV${String(deliveryCounter).padStart(6, "0")}`,
          orderId: order.id,
          branchId: branch.id,
          status: plan.progress === "delivered" ? "DELIVERED" : "DRIVER_ASSIGNED",
          driverId: driver.id,
          scheduledAt: hoursFrom(placedAt, turnaround),
          assignedAt: progressedTo(placedAt, turnaround - 2),
          dispatchedAt:
            plan.progress === "delivered"
              ? progressedTo(placedAt, turnaround - 1)
              : null,
          deliveredAt:
            plan.progress === "delivered" ? progressedTo(placedAt, turnaround) : null,
          contactName: customerName,
          contactPhone: customerPhone,
          addressLine: order.addressLine ?? "",
          amountToCollect: outstanding,
          amountCollected: plan.progress === "delivered" ? outstanding : 0,
          collectionMethod: plan.progress === "delivered" ? "CASH" : null,
          garmentCount: totalPieces,
          attemptCount: plan.progress === "delivered" ? 1 : 0,
          receivedByName: plan.progress === "delivered" ? customerName : null,
        },
      });
    }
  }

  // Roll the lifetime figures up the same way the application does, in one
  // pass rather than per order.
  await prisma.$executeRaw`
    UPDATE "customers" c
    SET "orderCount" = t."orders",
        "totalSpent" = t."paid",
        "outstandingAmount" = t."due",
        "lastOrderAt" = t."last"
    FROM (
      SELECT o."customerId" AS id,
             count(*) FILTER (WHERE o."status" <> 'CANCELLED') AS "orders",
             coalesce(sum(o."paidAmount") FILTER (WHERE o."status" <> 'CANCELLED'), 0) AS "paid",
             coalesce(sum(o."outstandingAmount") FILTER (WHERE o."status" <> 'CANCELLED'), 0) AS "due",
             max(o."placedAt") AS "last"
      FROM "orders" o
      WHERE o."customerId" IS NOT NULL
      GROUP BY o."customerId"
    ) t
    WHERE c."id" = t."id"`;

  // Keep the sequences ahead of everything the seed created.
  const sequences: [string, number][] = [
    ["order", orderCounter],
    ["garment", garmentCounter],
    ["invoice", invoiceCounter],
    ["payment", paymentCounter],
    ["delivery", deliveryCounter],
    ["pickup", pickupCounter],
    ["customer", customerCounter],
  ];

  await prisma.$transaction(
    sequences.map(([key, value]) =>
      prisma.sequence.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  );

  console.log(
    `  ${orderCounter} orders, ${garmentCounter} tracked garments, ${customerCounter} customers`,
  );
  return createdOrders;
}

async function seedComplaints(
  orders: { id: string; orderNumber: string; branchId: string }[],
  users: SeededUser[],
) {
  const manager = users.find((user) => user.role === "BRANCH_MANAGER")!;
  const qc = users.find((user) => user.role === "QC_STAFF")!;

  const samples = [
    {
      type: "STAIN_NOT_REMOVED" as const,
      priority: "MEDIUM" as const,
      description:
        "Customer says the oil mark on the shirt cuff is still visible after the wash.",
      status: "RESOLVED" as const,
      resolution: "REWASH" as const,
      resolutionNotes: "Rewashed with enzyme pre-treatment and returned the same evening.",
    },
    {
      type: "DAMAGED_GARMENT" as const,
      priority: "HIGH" as const,
      description: "A button is missing from the blazer front and the lining is torn.",
      status: "UNDER_INVESTIGATION" as const,
    },
    {
      type: "LATE_DELIVERY" as const,
      priority: "LOW" as const,
      description: "Order arrived two days after the promised date.",
      status: "RESOLVED" as const,
      resolution: "APOLOGY" as const,
      resolutionNotes: "Apologised and waived the express charge on the next order.",
    },
    {
      type: "MISSING_GARMENT" as const,
      priority: "CRITICAL" as const,
      description: "One pillow cover from a set of four did not come back.",
      status: "OPEN" as const,
    },
    {
      type: "COLOR_FADING" as const,
      priority: "MEDIUM" as const,
      description: "The maroon kurta has faded noticeably along the seams.",
      status: "AWAITING_CUSTOMER" as const,
    },
  ];

  for (const [index, sample] of samples.entries()) {
    const order = orders[index * 3] ?? orders[index];
    if (!order) continue;

    const garment = await prisma.garment.findFirst({
      where: { orderId: order.id },
      select: { id: true },
    });

    const orderRecord = await prisma.order.findUnique({
      where: { id: order.id },
      select: { customerName: true, customerPhone: true },
    });

    await prisma.complaint.create({
      data: {
        complaintNumber: `CMP${String(index + 1).padStart(5, "0")}`,
        type: sample.type,
        priority: sample.priority,
        status: sample.status,
        branchId: order.branchId,
        orderId: order.id,
        garmentId: garment?.id ?? null,
        raisedByName: orderRecord?.customerName ?? fullName(),
        raisedByPhone: orderRecord?.customerPhone ?? phone(),
        description: sample.description,
        assignedToId: index % 2 === 0 ? qc.id : manager.id,
        investigationNotes:
          sample.status === "OPEN"
            ? null
            : "Checked the intake photographs and spoke to the operator on shift.",
        resolution: sample.resolution ?? null,
        resolutionNotes: sample.resolutionNotes ?? null,
        resolvedAt: sample.resolution ? daysAgo(randomInt(1, 5)) : null,
        resolvedById: sample.resolution ? manager.id : null,
        createdById: manager.id,
        createdAt: daysAgo(randomInt(2, 14)),
      },
    });
  }

  await prisma.sequence.upsert({
    where: { key: "complaint" },
    create: { key: "complaint", value: samples.length },
    update: { value: samples.length },
  });

  console.log(`  ${samples.length} complaints`);
}

async function seedExpensesAndAttendance(
  branches: { id: string; code: string }[],
  users: SeededUser[],
) {
  const owner = users.find((user) => user.role === "OWNER")!;
  const accountant = users.find((user) => user.role === "ACCOUNTANT")!;

  const categories = [
    ["RENT", 45000, "Monthly branch rent"],
    ["SALARY", 180000, "Staff salaries"],
    ["UTILITIES", 22000, "Electricity and water"],
    ["MAINTENANCE", 8500, "Boiler servicing"],
    ["TRANSPORT", 12000, "Fuel and vehicle upkeep"],
    ["CONSUMABLES", 31000, "Detergent and packaging restock"],
    ["MARKETING", 15000, "Local flyer campaign"],
  ] as const;

  let expenseCounter = 0;
  for (const branch of branches.filter((entry) => entry.code !== "HO")) {
    for (const [category, amount, description] of categories) {
      expenseCounter += 1;
      await prisma.expense.create({
        data: {
          expenseNumber: `EXP${String(expenseCounter).padStart(5, "0")}`,
          branchId: branch.id,
          category,
          status: expenseCounter % 5 === 0 ? "PENDING" : "APPROVED",
          amount: round2(amount * (0.85 + random() * 0.3)),
          description,
          paymentMethod: "BANK_TRANSFER",
          expenseDate: daysAgo(randomInt(1, 30)),
          createdById: accountant.id,
          approvedById: expenseCounter % 5 === 0 ? null : owner.id,
          approvedAt: expenseCounter % 5 === 0 ? null : daysAgo(randomInt(1, 20)),
        },
      });
    }
  }

  await prisma.sequence.upsert({
    where: { key: "expense" },
    create: { key: "expense", value: expenseCounter },
    update: { value: expenseCounter },
  });

  // Two weeks of attendance for everyone on a branch.
  const attendance: {
    userId: string;
    branchId: string | null;
    date: Date;
    status: "PRESENT" | "ABSENT" | "WEEKLY_OFF" | "LEAVE";
  }[] = [];

  for (const user of users) {
    for (let day = 0; day < 14; day += 1) {
      const date = daysAgo(day, 0);
      date.setHours(0, 0, 0, 0);
      const isSunday = date.getDay() === 0;
      attendance.push({
        userId: user.id,
        branchId: user.branchId,
        date,
        status: isSunday
          ? "WEEKLY_OFF"
          : random() < 0.06
            ? random() < 0.5
              ? "ABSENT"
              : "LEAVE"
            : "PRESENT",
      });
    }
  }

  await prisma.attendance.createMany({ data: attendance, skipDuplicates: true });

  await prisma.leave.create({
    data: {
      userId: users.find((user) => user.role === "IRONING_STAFF")!.id,
      type: "CASUAL",
      fromDate: daysAgo(-3),
      toDate: daysAgo(-1),
      reason: "Family function out of town",
      status: "PENDING",
    },
  });

  console.log(`  ${expenseCounter} expenses, ${attendance.length} attendance records`);
}

async function main() {
  console.log("Seeding Aura Laundry ERP…\n");

  console.log("Clearing transactional data…");
  await clearTransactionalData();

  console.log("Permissions…");
  await seedPermissions();

  console.log("Settings…");
  await seedSettings();

  console.log("Branches…");
  const branches = await seedBranches();
  const branchList = [
    { id: branches.headOffice.id, code: "HO" },
    { id: branches.branch1.id, code: "BR1" },
    { id: branches.branch2.id, code: "BR2" },
    { id: branches.cpu.id, code: "CPU" },
  ];
  const operatingBranches = branchList.filter((branch) => branch.code !== "HO");

  await seedShifts(operatingBranches.map((branch) => branch.id));

  console.log("Staff…");
  const users = await seedUsers(branches);

  console.log("Catalogue…");
  const catalogue = await seedCatalogue();

  console.log("Racks…");
  const slots = await seedRacks(operatingBranches);

  console.log("Inventory…");
  const items = await seedInventory(operatingBranches.map((branch) => branch.id));

  console.log("Suppliers & purchases…");
  await seedSuppliers(
    branches.branch1.id,
    items,
    users.find((user) => user.role === "BRANCH_MANAGER")!.id,
  );

  console.log("Corporate accounts…");
  const b2bAccounts = await seedB2B(
    branches.branch1.id,
    catalogue.services,
    catalogue.garmentTypes,
  );

  console.log("Notification templates…");
  await seedNotificationTemplates();

  console.log("Orders & garments…");
  const orders = await seedOrders({
    branches: operatingBranches,
    services: catalogue.services.map((service) => ({
      id: service.id,
      code: service.code,
      pricingMode: service.pricingMode,
      basePrice: service.basePrice,
      stages: service.stages as string[],
      turnaroundHours: service.turnaroundHours,
    })),
    garmentTypes: catalogue.garmentTypes,
    users,
    slots: slots.map((slot) => ({
      id: slot.id,
      code: slot.code,
      rackId: slot.rackId,
    })),
    b2bAccounts: b2bAccounts.map((account) => ({
      id: account.id,
      code: account.code,
      businessName: account.businessName,
      phone: account.phone,
    })),
  });

  console.log("Complaints…");
  await seedComplaints(orders, users);

  console.log("Expenses & attendance…");
  await seedExpensesAndAttendance(branchList, users);

  console.log("\nDone. Sign in with any of these — password: " + DEMO_PASSWORD);
  console.log("  superadmin@auralaundry.example   Super Admin");
  console.log("  owner@auralaundry.example        Owner");
  console.log("  manager@auralaundry.example      Branch Manager");
  console.log("  counter@auralaundry.example      Counter Staff");
  console.log("  washing@auralaundry.example      Washing Staff");
  console.log("  ironing@auralaundry.example      Ironing Staff");
  console.log("  qc@auralaundry.example           QC Staff");
  console.log("  packing@auralaundry.example      Packing Staff");
  console.log("  driver@auralaundry.example       Driver");
  console.log("  accountant@auralaundry.example   Accountant");
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
