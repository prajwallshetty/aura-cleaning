import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileBarChart,
  MessageSquareWarning,
  Package,
  PackageCheck,
  Receipt,
  ScanLine,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/shared/filter-bar";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  OrderVolumeChart,
  RevenueChart,
} from "@/components/charts/revenue-chart";
import { CategoryBarChart } from "@/components/charts/category-bar-chart";
import { PipelineChart } from "@/components/charts/pipeline-chart";
import { prisma } from "@/lib/prisma";
import { formatCurrency, num } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  branchPerformance,
  dashboardMetrics,
  deliveryMetrics,
  orderStatusBreakdown,
  revenueSeries,
  servicePerformance,
  stagePipeline,
} from "@/lib/services/analytics";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";
import { ORDER_STATUS_LABELS } from "@/lib/workflow";
import {
  branchOptions,
  dateRangeFrom,
  param,
  scopedBranchId,
  type SearchParams,
} from "@/lib/queries/filters";
import type { OrderStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const branchId = scopedBranchId(user, params);
  const range = dateRangeFrom(params) ?? {
    from: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
    to: new Date(),
  };
  const serviceId = param(params, "service");
  const status = param(params, "status");

  const filters = {
    branchId,
    range,
    serviceId: serviceId && serviceId !== "all" ? serviceId : undefined,
    status: status && status !== "all" ? status : undefined,
  };

  const canSeeMoney = hasPermission(user, PERMISSIONS.DASHBOARD_VIEW_FINANCIALS);
  const canSeeAllBranches = hasPermission(
    user,
    PERMISSIONS.DASHBOARD_VIEW_ALL_BRANCHES,
  );

  const [
    metrics,
    series,
    statusBreakdown,
    services,
    pipeline,
    delivery,
    branches,
    serviceOptions,
    recentOrders,
    branchStats,
  ] = await Promise.all([
    dashboardMetrics(filters),
    revenueSeries(filters),
    orderStatusBreakdown(filters),
    servicePerformance(filters),
    stagePipeline(branchId),
    deliveryMetrics(filters),
    branchOptions(user),
    prisma.service.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.order.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        status: { notIn: ["DELIVERED", "CANCELLED", "REFUNDED"] },
      },
      orderBy: { expectedDeliveryAt: "asc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        status: true,
        totalPieces: true,
        expectedDeliveryAt: true,
        outstandingAmount: true,
      },
    }),
    canSeeAllBranches ? branchPerformance(range) : Promise.resolve([]),
  ]);

  const now = new Date();

  const quickActions = [
    { label: "New order", href: "/orders/new", icon: ClipboardList, permission: PERMISSIONS.ORDER_CREATE },
    { label: "Scan", href: "/scan", icon: ScanLine, permission: PERMISSIONS.GARMENT_SCAN },
    { label: "Customers", href: "/customers", icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
    { label: "Payments", href: "/billing", icon: Receipt, permission: PERMISSIONS.BILLING_VIEW },
    { label: "Reports", href: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORT_VIEW },
  ].filter((action) => hasPermission(user, action.permission));

  return (
    <div className="space-y-5">
      <LiveRefresh intervalMs={20000} />
      <PageHeader
        title="Dashboard"
        description={`${formatDate(range.from)} – ${formatDate(range.to)}${user.branchName && !canSeeAllBranches ? ` · ${user.branchName}` : ""}`}
        actions={
          hasPermission(user, PERMISSIONS.ORDER_CREATE) ? (
            <Button asChild>
              <Link href="/orders/new">New order</Link>
            </Button>
          ) : null
        }
      />

      {quickActions.length > 0 ? (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quick actions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                title={action.label}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent lift"
              >
                <action.icon className="size-3.5" aria-hidden />
                {action.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <FilterBar
        showSearch={false}
        showDateRange
        filters={[
          {
            name: "status",
            label: "Status",
            options: (Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map(
              (value) => ({ value, label: ORDER_STATUS_LABELS[value] }),
            ),
          },
          {
            name: "service",
            label: "Service",
            options: serviceOptions.map((service) => ({
              value: service.id,
              label: service.name,
            })),
          },
          ...(branches.length > 1
            ? [{ name: "branch", label: "Branch", options: branches }]
            : []),
        ]}
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's orders"
          value={metrics.todayOrders}
          icon={ClipboardList}
          href="/orders?range=today"
        />
        <StatCard
          label="Received"
          value={metrics.received}
          icon={Package}
          tone="info"
          href="/orders?status=RECEIVED"
        />
        <StatCard
          label="Processing"
          value={metrics.processing}
          icon={Package}
          hint={`${metrics.garmentsInProcess} garments on the floor`}
          href="/processing"
        />
        <StatCard
          label="Ready"
          value={metrics.ready}
          icon={PackageCheck}
          tone="success"
          href="/orders?status=READY"
        />
        <StatCard
          label="Out for delivery"
          value={metrics.outForDelivery}
          icon={Truck}
          tone="info"
          href="/delivery"
        />
        <StatCard
          label="Completed"
          value={metrics.completed}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Delayed"
          value={metrics.delayed}
          icon={Clock}
          tone={metrics.delayed > 0 ? "danger" : "default"}
          href="/orders?delayed=true"
        />
        <StatCard
          label="Open complaints"
          value={metrics.openComplaints}
          icon={MessageSquareWarning}
          tone={metrics.openComplaints > 0 ? "warning" : "default"}
          href="/complaints?status=OPEN"
        />
      </section>

      {canSeeMoney ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Today's revenue"
            value={formatCurrency(metrics.todayRevenue)}
            icon={Wallet}
            tone="success"
          />
          <StatCard
            label="Pending payments"
            value={formatCurrency(metrics.pendingPayments)}
            icon={Banknote}
            tone={metrics.pendingPayments > 0 ? "warning" : "default"}
            href="/billing?tab=outstanding"
          />
          <StatCard
            label="Low stock items"
            value={metrics.lowStock}
            icon={metrics.lowStock > 0 ? AlertTriangle : Boxes}
            tone={metrics.lowStock > 0 ? "danger" : "default"}
            href="/inventory?tab=low"
          />
        </section>
      ) : null}

      {canSeeMoney ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RevenueChart data={series} />
          <OrderVolumeChart data={series} />
        </section>
      ) : (
        <OrderVolumeChart data={series} />
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PipelineChart data={pipeline} />
        <CategoryBarChart
          title="Orders by status"
          description="Where the book of work currently sits"
          data={statusBreakdown.map((slice) => ({
            name: slice.name,
            value: slice.value,
          }))}
          valueLabel="Orders"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBarChart
          title="Service performance"
          description={canSeeMoney ? "Revenue by service" : "Pieces by service"}
          humanizeNames={false}
          color="var(--chart-3)"
          data={services.slice(0, 8).map((service) => ({
            name: service.name,
            value: canSeeMoney ? service.revenue : service.pieces,
            secondary: {
              label: canSeeMoney ? "Pieces" : "Orders",
              value: String(canSeeMoney ? service.pieces : service.orders),
            },
          }))}
          valueLabel={canSeeMoney ? "Revenue" : "Pieces"}
          format={canSeeMoney ? "currency" : "number"}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Delivery performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Scheduled" value={delivery.scheduled} />
              <Metric label="Delivered" value={delivery.delivered} tone="success" />
              <Metric
                label="Failed"
                value={delivery.failed}
                tone={delivery.failed > 0 ? "danger" : undefined}
              />
              <Metric label="On time" value={`${delivery.onTimePercentage}%`} />
            </div>

            {delivery.driverPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No driver activity in this period.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {delivery.driverPerformance.slice(0, 5).map((driver) => (
                  <li
                    key={driver.driverId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{driver.name}</span>
                    <span className="text-xs text-muted-foreground numeric">
                      {driver.delivered} delivered · {driver.failed} failed
                    </span>
                    {canSeeMoney ? (
                      <span className="text-sm numeric">
                        {formatCurrency(driver.collected)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Due soonest</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <EmptyState
                title="Nothing in progress"
                description="Every order has been handed over."
              />
            ) : (
              <ul className="space-y-1.5">
                {recentOrders.map((order) => {
                  const late = order.expectedDeliveryAt < now;
                  return (
                    <li key={order.id}>
                      <Link
                        href={`/orders/${order.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-medium">
                            {order.orderNumber}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {order.customerName} · {order.totalPieces} pcs
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={order.status} />
                          <span
                            className={`text-xs ${late ? "font-medium text-destructive" : "text-muted-foreground"}`}
                          >
                            {formatDateTime(order.expectedDeliveryAt)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {canSeeAllBranches && branchStats.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Branch performance</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 text-left">Branch</th>
                    <th className="px-4 py-2.5 text-right">Orders</th>
                    {canSeeMoney ? (
                      <>
                        <th className="px-4 py-2.5 text-right">Revenue</th>
                        <th className="px-4 py-2.5 text-right">Outstanding</th>
                      </>
                    ) : null}
                    <th className="px-4 py-2.5 text-right">Delayed</th>
                  </tr>
                </thead>
                <tbody>
                  {branchStats.map((branch) => (
                    <tr key={branch.branchId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-medium">{branch.name}</td>
                      <td className="px-4 py-2.5 text-right numeric">{branch.orders}</td>
                      {canSeeMoney ? (
                        <>
                          <td className="px-4 py-2.5 text-right numeric">
                            {formatCurrency(branch.revenue)}
                          </td>
                          <td className="px-4 py-2.5 text-right numeric">
                            {formatCurrency(branch.outstanding)}
                          </td>
                        </>
                      ) : null}
                      <td className="px-4 py-2.5 text-right numeric">
                        <span className={branch.delayed > 0 ? "text-destructive" : ""}>
                          {branch.delayed}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-semibold numeric ${
          tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
