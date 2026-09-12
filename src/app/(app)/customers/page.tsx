import Link from "next/link";
import { BadgeIndianRupee, Repeat, Users, Wallet } from "lucide-react";

import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, num } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";
import { branchOptions, pageParam, param, type SearchParams } from "@/lib/queries/filters";
import { listCustomers, type CustomerSort } from "@/lib/services/customers";

import { NewCustomerDialog } from "./customer-dialogs";

export const metadata = { title: "Customers" };

const SORTS = [
  { value: "recent", label: "Most recent order" },
  { value: "name", label: "Name" },
  { value: "spend", label: "Lifetime spend" },
  { value: "outstanding", label: "Balance owed" },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await requirePermission(PERMISSIONS.CUSTOMER_VIEW);

  const search = param(params, "q");
  const sort = (param(params, "sort") ?? "recent") as CustomerSort;
  const onlyOutstanding = param(params, "balance") === "owing";
  const page = pageParam(params);

  const seesAllBranches = hasPermission(user, PERMISSIONS.DASHBOARD_VIEW_ALL_BRANCHES);
  const branchIds = seesAllBranches ? null : user.branchId ? [user.branchId] : [];

  const [{ rows, total, pageSize }, branches, totals] = await Promise.all([
    listCustomers({
      branchIds,
      search,
      sort: SORTS.some((option) => option.value === sort) ? sort : "recent",
      onlyOutstanding,
      page,
      pageSize: 25,
    }),
    branchOptions(user),
    prisma.customer.aggregate({
      where: branchIds ? { branchId: { in: branchIds } } : {},
      _count: { _all: true },
      _sum: { totalSpent: true, outstandingAmount: true },
    }),
  ]);

  const repeatCount = await prisma.customer.count({
    where: {
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      orderCount: { gt: 1 },
    },
  });

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0 space-y-0.5">
          <Link
            href={`/customers/${row.id}`}
            className="block truncate text-sm font-medium text-primary hover:underline"
          >
            {row.name}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">
            {row.phone} · {row.code}
          </p>
        </div>
      ),
    },
    {
      key: "repeat",
      header: "Type",
      cell: (row) =>
        row.isRepeat ? (
          <Badge tone="success" className="gap-1">
            <Repeat className="size-3" /> Repeat
          </Badge>
        ) : (
          <Badge tone="neutral">New</Badge>
        ),
    },
    {
      key: "branch",
      header: "Branch",
      hideOnMobile: true,
      cell: (row) => <span className="text-sm text-muted-foreground">{row.branchName}</span>,
    },
    {
      key: "orders",
      header: "Orders",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => <span className="text-sm numeric">{row.orderCount}</span>,
    },
    {
      key: "spend",
      header: "Lifetime spend",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => (
        <span className="text-sm numeric">{formatCurrency(row.totalSpent)}</span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => (
        <span
          className={`text-sm numeric ${row.outstandingAmount > 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}
        >
          {formatCurrency(row.outstandingAmount)}
        </span>
      ),
    },
    {
      key: "last",
      header: "Last order",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.lastOrderAt ? formatDate(row.lastOrderAt) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <Button asChild size="sm" variant="outline">
          <Link href={`/orders/new?customer=${row.id}`}>New order</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Everyone who has walked in or booked a pickup, with what they have spent and what they still owe."
        actions={
          hasPermission(user, PERMISSIONS.CUSTOMER_MANAGE) ? (
            <NewCustomerDialog branches={branches} defaultBranchId={user.branchId} />
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={totals._count._all} icon={Users} />
        <StatCard label="Repeat customers" value={repeatCount} icon={Repeat} tone="success" />
        <StatCard
          label="Lifetime revenue"
          value={formatCurrency(num(totals._sum.totalSpent))}
          icon={BadgeIndianRupee}
        />
        <StatCard
          label="Balance owed"
          value={formatCurrency(num(totals._sum.outstandingAmount))}
          icon={Wallet}
          tone={num(totals._sum.outstandingAmount) > 0 ? "warning" : "default"}
        />
      </div>

      <FilterBar
        searchPlaceholder="Name, phone, customer code or order number…"
        filters={[
          { name: "sort", label: "Sort", options: SORTS },
          {
            name: "balance",
            label: "Balance",
            options: [{ value: "owing", label: "Owing money" }],
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        empty={
          <EmptyState
            icon={Users}
            title={search ? "No customer matches that" : "No customers yet"}
            description={
              search
                ? "Try a phone number, a customer code, or an order number they placed."
                : "Customers are created automatically the first time an order is booked against a phone number."
            }
          />
        }
      />

      <Pagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
