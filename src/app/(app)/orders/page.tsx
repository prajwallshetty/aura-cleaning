import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { prisma } from "@/lib/prisma";
import { formatCurrency, num } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";
import { ORDER_STATUS_LABELS } from "@/lib/workflow";
import {
  PAGE_SIZE,
  branchOptions,
  dateRangeFrom,
  enumOptions,
  pageParam,
  param,
  scopedBranchId,
  type SearchParams,
} from "@/lib/queries/filters";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Orders" };

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  paymentStatus: string;
  type: string;
  priority: string;
  totalAmount: number;
  outstandingAmount: number;
  totalPieces: number;
  placedAt: Date;
  expectedDeliveryAt: Date;
  branchName: string;
  isDelayed: boolean;
  slot: string | null;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await requirePermission(PERMISSIONS.ORDER_VIEW);

  const page = pageParam(params);
  const branchId = scopedBranchId(user, params);
  const range = dateRangeFrom(params);
  const search = param(params, "q");
  const status = param(params, "status");
  const paymentStatus = param(params, "payment");
  const type = param(params, "type");
  const serviceId = param(params, "service");
  const delayedOnly = param(params, "delayed") === "true";

  const where: Prisma.OrderWhereInput = {
    ...(branchId ? { branchId } : {}),
    // "active" is the counter's word for everything still on the floor.
    ...(status === "active"
      ? { status: { notIn: ["DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[] } }
      : status && status !== "all"
        ? { status: status as OrderStatus }
        : {}),
    ...(paymentStatus && paymentStatus !== "all"
      ? { paymentStatus: paymentStatus as never }
      : {}),
    ...(type && type !== "all" ? { type: type as never } : {}),
    ...(serviceId && serviceId !== "all"
      ? { items: { some: { serviceId } } }
      : {}),
    ...(range ? { placedAt: { gte: range.from, lte: range.to } } : {}),
    ...(delayedOnly
      ? {
          expectedDeliveryAt: { lt: new Date() },
          status: { notIn: ["DELIVERED", "CANCELLED", "REFUNDED"] },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
            { customerPhone: { contains: search } },
            { garments: { some: { garmentCode: { equals: search.toUpperCase() } } } },
          ],
        }
      : {}),
  };

  const [orders, total, aggregates, services, branches] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        branch: { select: { name: true } },
        rackSlot: { select: { code: true, rack: { select: { code: true } } } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({
      where,
      _sum: { totalAmount: true, outstandingAmount: true },
    }),
    prisma.service.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    branchOptions(user),
  ]);

  const now = new Date();
  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    status: order.status,
    paymentStatus: order.paymentStatus,
    type: order.type,
    priority: order.priority,
    totalAmount: num(order.totalAmount),
    outstandingAmount: num(order.outstandingAmount),
    totalPieces: order.totalPieces,
    placedAt: order.placedAt,
    expectedDeliveryAt: order.expectedDeliveryAt,
    branchName: order.branch.name,
    isDelayed:
      order.expectedDeliveryAt < now &&
      !["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status),
    slot: order.rackSlot ? `${order.rackSlot.rack.code}${order.rackSlot.code.replace(order.rackSlot.rack.code, "")}` : null,
  }));

  const canCreate = hasPermission(user, PERMISSIONS.ORDER_CREATE);
  const canSeeMoney = hasPermission(user, [
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.DASHBOARD_VIEW_FINANCIALS,
  ]);

  const columns: Column<OrderRow>[] = [
    {
      key: "order",
      header: "Order",
      cell: (row) => (
        <div className="space-y-0.5">
          <Link
            href={`/orders/${row.id}`}
            className="font-mono text-sm font-semibold text-primary hover:underline"
          >
            {row.orderNumber}
          </Link>
          <p className="text-xs text-muted-foreground">
            {row.totalPieces} pcs · {row.type.replace(/_/g, " ").toLowerCase()}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{row.customerName}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.customerPhone}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={row.status} dot />
          {row.priority !== "NORMAL" ? (
            <StatusBadge status={row.priority} />
          ) : null}
        </div>
      ),
    },
    {
      key: "location",
      header: "Rack",
      hideOnMobile: true,
      cell: (row) =>
        row.slot ? (
          <span className="font-mono text-sm">{row.slot}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "placed",
      header: "Placed",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.placedAt)}
        </span>
      ),
    },
    {
      key: "due",
      header: "Due",
      cell: (row) => (
        <span
          className={
            row.isDelayed ? "text-sm font-medium text-destructive" : "text-sm"
          }
        >
          {formatDate(row.expectedDeliveryAt)}
          {row.isDelayed ? (
            <span className="ml-1 text-xs font-normal">(late)</span>
          ) : null}
        </span>
      ),
    },
    ...(canSeeMoney
      ? [
          {
            key: "amount",
            header: "Amount",
            className: "text-right",
            headerClassName: "text-right",
            cell: (row: OrderRow) => (
              <div className="space-y-0.5 text-right">
                <p className="text-sm font-medium numeric">
                  {formatCurrency(row.totalAmount)}
                </p>
                <StatusBadge status={row.paymentStatus} />
              </div>
            ),
          } satisfies Column<OrderRow>,
        ]
      : []),
    ...(user.permissions.includes(PERMISSIONS.DASHBOARD_VIEW_ALL_BRANCHES)
      ? [
          {
            key: "branch",
            header: "Branch",
            hideOnMobile: true,
            cell: (row: OrderRow) => (
              <span className="text-sm text-muted-foreground">{row.branchName}</span>
            ),
          } satisfies Column<OrderRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orders"
        description="Every order booked across the business, from intake to delivery."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/orders/new">
                <Plus /> New order
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Orders matched" value={total} icon={ClipboardList} />
        {canSeeMoney ? (
          <>
            <StatCard
              label="Value"
              value={formatCurrency(aggregates._sum.totalAmount ?? 0)}
              tone="info"
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(aggregates._sum.outstandingAmount ?? 0)}
              tone="warning"
            />
          </>
        ) : null}
      </div>

      <FilterBar
        searchPlaceholder="Order number, customer, phone or garment code…"
        showDateRange
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "active", label: "Still in progress" },
              ...enumOptions(ORDER_STATUSES, ORDER_STATUS_LABELS),
            ],
          },
          {
            name: "payment",
            label: "Payment",
            options: enumOptions([
              "UNPAID",
              "PARTIALLY_PAID",
              "PAID",
              "REFUNDED",
              "PARTIALLY_REFUNDED",
            ] as const),
          },
          {
            name: "type",
            label: "Type",
            options: enumOptions(["WALK_IN", "PICKUP", "DELIVERY"] as const),
          },
          {
            name: "service",
            label: "Service",
            options: services.map((service) => ({
              value: service.id,
              label: service.name,
            })),
          },
          ...(branches.length > 1
            ? [{ name: "branch", label: "Branch", options: branches }]
            : []),
          {
            name: "delayed",
            label: "Delay",
            options: [{ value: "true", label: "Delayed only" }],
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        rowClassName={(row) => (row.isDelayed ? "bg-destructive/4" : undefined)}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No orders found"
            description="Nothing matches these filters. Try widening the date range or clearing the search."
            action={
              canCreate ? (
                <Button asChild size="sm">
                  <Link href="/orders/new">
                    <Plus /> Book an order
                  </Link>
                </Button>
              ) : null
            }
          />
        }
      />

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
