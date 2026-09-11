import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Search as SearchIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { parseScan } from "@/lib/codes";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";
import { GARMENT_STATUS_LABELS, STAGE_LABELS } from "@/lib/workflow";
import { param, scopedBranchId, type SearchParams } from "@/lib/queries/filters";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await requirePermission(PERMISSIONS.ORDER_VIEW);
  const query = param(params, "q")?.trim();

  if (!query) {
    return (
      <div className="space-y-5">
        <PageHeader title="Search" />
        <EmptyState
          icon={SearchIcon}
          title="Search anything"
          description="Garment codes (G1001), order numbers (ORD10245), rack slots (B17) or a customer phone number."
        />
      </div>
    );
  }

  const branchId = scopedBranchId(user, params);
  const parsed = parseScan(query);

  // A direct garment hit is the most common lookup — jump straight there.
  if (parsed.kind === "garment") {
    const garment = await prisma.garment.findUnique({
      where: { garmentCode: parsed.value },
      select: { garmentCode: true, branchId: true },
    });
    if (garment && (!branchId || garment.branchId === branchId)) {
      redirect(`/garments/${garment.garmentCode}`);
    }
  }

  const upper = query.toUpperCase();
  const branchFilter = branchId ? { branchId } : {};

  const [orders, garments, slots] = await Promise.all([
    prisma.order.findMany({
      where: {
        ...branchFilter,
        OR: [
          { orderNumber: { contains: upper } },
          { customerPhone: { contains: query } },
          { customerName: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { placedAt: "desc" },
      take: 20,
      include: {
        branch: { select: { name: true } },
        rackSlot: { select: { code: true, rack: { select: { code: true } } } },
      },
    }),
    prisma.garment.findMany({
      where: {
        ...branchFilter,
        OR: [
          { garmentCode: { contains: upper } },
          { barcodeValue: { contains: upper } },
          { order: { customerPhone: { contains: query } } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        order: { select: { id: true, orderNumber: true, customerName: true } },
        garmentType: { select: { name: true } },
        rackSlot: { select: { code: true, rack: { select: { code: true } } } },
      },
    }),
    prisma.rackSlot.findMany({
      where: {
        code: { contains: upper },
        rack: { ...(branchId ? { branchId } : {}) },
      },
      take: 10,
      include: {
        rack: { select: { id: true, code: true, name: true, branch: { select: { name: true } } } },
        _count: { select: { garments: true } },
      },
    }),
  ]);

  const canSeeMoney = hasPermission(user, [
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.DASHBOARD_VIEW_FINANCIALS,
  ]);
  const nothingFound =
    orders.length === 0 && garments.length === 0 && slots.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Results for “${query}”`}
        description={`${orders.length} orders · ${garments.length} garments · ${slots.length} rack slots`}
      />

      {nothingFound ? (
        <EmptyState
          icon={SearchIcon}
          title="Nothing matched"
          description="Check the code and try again. Garment codes look like G1001 and order numbers like ORD10245."
        />
      ) : null}

      {garments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Garments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {garments.map((garment) => (
              <Link
                key={garment.id}
                href={`/garments/${garment.garmentCode}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <span className="font-mono font-semibold">{garment.garmentCode}</span>
                  <span className="ml-2 text-muted-foreground">
                    {garment.garmentType.name} · {garment.order.orderNumber} ·{" "}
                    {garment.order.customerName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={garment.status}
                    label={GARMENT_STATUS_LABELS[garment.status]}
                  />
                  {garment.rackSlot ? (
                    <span className="flex items-center gap-1 font-mono text-xs font-medium text-success">
                      <MapPin className="size-3" />
                      {garment.rackSlot.rack.code} · {garment.rackSlot.code}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {STAGE_LABELS[garment.currentStage]}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {orders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <span className="font-mono font-semibold">{order.orderNumber}</span>
                  <span className="ml-2 text-muted-foreground">
                    {order.customerName} · {order.customerPhone} ·{" "}
                    {formatDateTime(order.placedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={order.status} dot />
                  {order.rackSlot ? (
                    <span className="flex items-center gap-1 font-mono text-xs font-medium text-success">
                      <MapPin className="size-3" />
                      {order.rackSlot.rack.code} · {order.rackSlot.code}
                    </span>
                  ) : null}
                  {canSeeMoney ? (
                    <span className="numeric text-xs">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {slots.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Rack slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slots.map((slot) => (
              <Link
                key={slot.id}
                href={`/racks/${slot.rack.id}?slot=${slot.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted/40"
              >
                <span className="font-mono font-semibold">
                  {slot.rack.code} · {slot.code}
                </span>
                <span className="text-muted-foreground">
                  {slot.rack.name} · {slot.rack.branch.name}
                </span>
                <span className="numeric text-xs">
                  {slot._count.garments}/{slot.capacity} garments
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
