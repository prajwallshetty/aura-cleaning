import "server-only";
import { prisma } from "@/lib/prisma";
import { num, round2 } from "@/lib/money";
import { todayRange } from "@/lib/dates";
import { isGlobalRole } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";

/** One day of trading, used to draw the performance chart. */
export interface PerformancePoint {
  date: string;
  orders: number;
  revenue: number;
  completed: number;
}

export interface ScheduleEntry {
  id: string;
  kind: "PICKUP" | "DELIVERY";
  /** Past its slot and still open. */
  overdue: boolean;
  /** ISO timestamp; the client formats it. */
  at: string;
  title: string;
  orderNumber: string;
  contact: string;
  address: string;
  status: string;
  amountToCollect: number;
  href: string;
}

export interface StationLoad {
  stage: string;
  label: string;
  /** Share of this station's work that is finished, 0–100. */
  percent: number;
  waiting: number;
  done: number;
  trend: "up" | "down";
}

export interface OverviewData {
  business: {
    name: string;
    ownerName: string;
    ownerRole: string;
    branchName: string;
    staffCount: number;
    activeOrders: number;
    completedOrders: number;
  };
  priority: {
    percent: number;
    urgentPending: number;
    urgentTotal: number;
  };
  tasks: {
    percent: number;
    washing: number;
    ironing: number;
    packing: number;
  };
  performance: PerformancePoint[];
  schedule: ScheduleEntry[];
  operations: StationLoad[];
  headline: {
    onTimePercent: number;
    revenueTotal: number;
    orderTotal: number;
  };
}

const STATION_LABELS: Record<string, string> = {
  WASHING: "Washing",
  DRYING: "Drying",
  IRONING: "Ironing",
  PACKING: "Packing",
  DISPATCH: "Ready",
};

const STATIONS = ["WASHING", "DRYING", "IRONING", "PACKING", "DISPATCH"] as const;

const PERFORMANCE_DAYS = 120;

/**
 * Everything the overview dashboard renders, in one round of queries.
 * Scoped to the viewer's branch unless their role sees the whole business.
 */
export async function getOverviewData(user: SessionUser): Promise<OverviewData> {
  const scopeAll = isGlobalRole(user.role);
  const branchId = scopeAll ? undefined : (user.branchId ?? "__none__");
  const branchFilter = branchId ? { branchId } : {};

  const today = todayRange();
  // "Today's schedule" leads with what is due today but keeps the next few
  // days in view, the way a counter actually plans its runs.
  const scheduleHorizon = new Date(today.to);
  scheduleHorizon.setDate(scheduleHorizon.getDate() + 6);
  const since = new Date();
  since.setDate(since.getDate() - (PERFORMANCE_DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    branch,
    staffCount,
    activeOrders,
    completedOrders,
    urgentOrders,
    stationGroups,
    trendGroups,
    orderRows,
    paymentRows,
    pickups,
    deliveries,
    deliveredWindow,
  ] = await Promise.all([
    user.branchId
      ? prisma.branch.findUnique({
          where: { id: user.branchId },
          select: { name: true, code: true },
        })
      : Promise.resolve(null),
    prisma.user.count({ where: { status: "ACTIVE", ...branchFilter } }),
    prisma.order.count({
      where: {
        ...branchFilter,
        status: { notIn: ["DELIVERED", "CANCELLED", "REFUNDED"] },
      },
    }),
    prisma.order.count({ where: { ...branchFilter, status: "DELIVERED" } }),
    prisma.order.findMany({
      where: {
        ...branchFilter,
        priority: { in: ["EXPRESS", "URGENT"] },
        placedAt: { gte: thirtyDaysAgo },
      },
      select: { status: true },
    }),
    prisma.processingTask.groupBy({
      by: ["stage", "status"],
      where: { ...branchFilter },
      _count: { _all: true },
    }),
    prisma.processingTask.groupBy({
      by: ["stage"],
      where: {
        ...branchFilter,
        status: { in: ["COMPLETED", "PASSED"] },
        completedAt: { gte: thirtyDaysAgo },
      },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: {
        ...branchFilter,
        placedAt: { gte: since },
        status: { not: "CANCELLED" },
      },
      select: { placedAt: true, deliveredAt: true, totalAmount: true },
    }),
    prisma.payment.findMany({
      where: { ...branchFilter, state: "CAPTURED", paidAt: { gte: since } },
      select: { paidAt: true, amount: true },
    }),
    prisma.pickup.findMany({
      where: {
        ...branchFilter,
        status: { notIn: ["RECEIVED_AT_LAUNDRY", "CANCELLED"] },
        scheduledAt: { lte: scheduleHorizon },
      },
      orderBy: { scheduledAt: "asc" },
      take: 12,
      include: {
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.delivery.findMany({
      where: {
        ...branchFilter,
        status: { notIn: ["DELIVERED", "CANCELLED"] },
        scheduledAt: { lte: scheduleHorizon },
      },
      orderBy: { scheduledAt: "asc" },
      take: 12,
      include: {
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.delivery.findMany({
      where: { ...branchFilter, status: "DELIVERED", deliveredAt: { gte: thirtyDaysAgo } },
      select: { scheduledAt: true, deliveredAt: true },
    }),
  ]);

  // --- Priority orders -----------------------------------------------------
  const urgentTotal = urgentOrders.length;
  const urgentDone = urgentOrders.filter(
    (order) => order.status === "DELIVERED",
  ).length;
  const urgentPending = urgentOrders.filter(
    (order) => !["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status),
  ).length;

  // --- Station load --------------------------------------------------------
  const byStation = new Map<string, { waiting: number; done: number }>();
  for (const row of stationGroups) {
    const entry = byStation.get(row.stage) ?? { waiting: 0, done: 0 };
    if (["COMPLETED", "PASSED", "SKIPPED"].includes(row.status)) {
      entry.done += row._count._all;
    } else {
      entry.waiting += row._count._all;
    }
    byStation.set(row.stage, entry);
  }

  const recentByStation = new Map(
    trendGroups.map((row) => [row.stage, row._count._all]),
  );

  const operations: StationLoad[] = STATIONS.map((stage) => {
    const entry = byStation.get(stage) ?? { waiting: 0, done: 0 };
    const total = entry.waiting + entry.done;
    const recent = recentByStation.get(stage) ?? 0;
    return {
      stage,
      label: STATION_LABELS[stage] ?? stage,
      percent: total > 0 ? Math.round((entry.done / total) * 100) : 0,
      waiting: entry.waiting,
      done: entry.done,
      // Stations that cleared work in the last month are trending up.
      trend: recent > entry.waiting ? "up" : "down",
    };
  });

  const washing = operations.find((o) => o.stage === "WASHING")?.percent ?? 0;
  const ironing = operations.find((o) => o.stage === "IRONING")?.percent ?? 0;
  const packing = operations.find((o) => o.stage === "PACKING")?.percent ?? 0;

  // --- Performance series --------------------------------------------------
  const buckets = new Map<string, PerformancePoint>();
  const cursor = new Date(since);
  while (cursor <= today.to) {
    buckets.set(cursor.toISOString().slice(0, 10), {
      date: cursor.toISOString().slice(0, 10),
      orders: 0,
      revenue: 0,
      completed: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const order of orderRows) {
    const bucket = buckets.get(order.placedAt.toISOString().slice(0, 10));
    if (bucket) bucket.orders += 1;

    if (order.deliveredAt) {
      const doneBucket = buckets.get(order.deliveredAt.toISOString().slice(0, 10));
      if (doneBucket) doneBucket.completed += 1;
    }
  }

  for (const payment of paymentRows) {
    const bucket = buckets.get(payment.paidAt.toISOString().slice(0, 10));
    if (bucket) bucket.revenue = round2(bucket.revenue + num(payment.amount));
  }

  const performance = [...buckets.values()];

  // --- Today's schedule ----------------------------------------------------
  const schedule: ScheduleEntry[] = [
    ...pickups.map((pickup) => ({
      id: pickup.id,
      kind: "PICKUP" as const,
      overdue: pickup.scheduledAt < new Date(),
      at: pickup.scheduledAt.toISOString(),
      title: `Pickup — ${pickup.contactName}`,
      orderNumber: pickup.order.orderNumber,
      contact: pickup.contactPhone,
      address: pickup.addressLine,
      status: pickup.status,
      amountToCollect: 0,
      href: `/orders/${pickup.order.id}`,
    })),
    ...deliveries.map((delivery) => ({
      id: delivery.id,
      kind: "DELIVERY" as const,
      overdue: delivery.scheduledAt < new Date(),
      at: delivery.scheduledAt.toISOString(),
      title: `Delivery — ${delivery.contactName}`,
      orderNumber: delivery.order.orderNumber,
      contact: delivery.contactPhone,
      address: delivery.addressLine,
      status: delivery.status,
      amountToCollect: num(delivery.amountToCollect),
      href: `/orders/${delivery.order.id}`,
    })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 6);

  // --- Headline ------------------------------------------------------------
  const onTime = deliveredWindow.filter(
    (entry) => entry.deliveredAt && entry.deliveredAt <= entry.scheduledAt,
  ).length;

  return {
    business: {
      name: branch?.name ?? "Aura Laundry",
      ownerName: user.name,
      ownerRole: scopeAll ? "Business Owner" : "Branch Manager",
      branchName: branch?.name ?? "All branches",
      staffCount,
      activeOrders,
      completedOrders,
    },
    priority: {
      percent: urgentTotal > 0 ? Math.round((urgentDone / urgentTotal) * 100) : 0,
      urgentPending,
      urgentTotal,
    },
    tasks: {
      percent: Math.round((washing + ironing + packing) / 3),
      washing,
      ironing,
      packing,
    },
    performance,
    schedule,
    operations,
    headline: {
      onTimePercent:
        deliveredWindow.length > 0
          ? Math.round((onTime / deliveredWindow.length) * 100)
          : 0,
      revenueTotal: round2(
        performance.reduce((sum, point) => sum + point.revenue, 0),
      ),
      orderTotal: performance.reduce((sum, point) => sum + point.orders, 0),
    },
  };
}
