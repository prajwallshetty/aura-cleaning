import Link from "next/link";

import { MoveGarmentDialog, type SlotOption } from "@/app/(app)/racks/move-garment";
import { notFound } from "next/navigation";
import { ArrowLeft, Warehouse } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { GenerateSlotsDialog } from "@/app/(app)/racks/rack-dialogs";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/rbac";
import { assertBranchAccess, hasPermission, requirePermission } from "@/lib/session";
import { GARMENT_STATUS_LABELS } from "@/lib/workflow";
import { param, type SearchParams } from "@/lib/queries/filters";

export const metadata = { title: "Rack" };

interface SlotGarmentRow {
  id: string;
  garmentCode: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  typeName: string;
  status: string;
  since: Date;
}

export default async function RackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requirePermission(PERMISSIONS.RACK_VIEW);

  const rack = await prisma.rack.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true, code: true } },
      slots: {
        orderBy: { code: "asc" },
        include: { _count: { select: { garments: true } } },
      },
    },
  });

  if (!rack) notFound();
  assertBranchAccess(user, rack.branchId);

  const canAssign = hasPermission(user, PERMISSIONS.RACK_ASSIGN);

  // Every slot in the branch with room in it, so a garment can be moved to
  // another rack and not only another slot on this one.
  const slotOptions: SlotOption[] = canAssign
    ? (
        await prisma.rackSlot.findMany({
          where: { isActive: true, rack: { branchId: rack.branchId } },
          orderBy: [{ rack: { code: "asc" } }, { code: "asc" }],
          select: {
            id: true,
            code: true,
            capacity: true,
            rack: { select: { code: true } },
            _count: { select: { garments: true } },
          },
        })
      ).map((slot) => ({
        id: slot.id,
        label: `${slot.rack.code}-${slot.code}`,
        free: Math.max(0, slot.capacity - slot._count.garments),
      }))
    : [];

  const selectedSlotId = param(query, "slot") ?? rack.slots[0]?.id;
  const selectedSlot = rack.slots.find((slot) => slot.id === selectedSlotId);

  const garments = selectedSlot
    ? await prisma.garment.findMany({
        where: { rackSlotId: selectedSlot.id },
        orderBy: { garmentCode: "asc" },
        include: {
          order: { select: { id: true, orderNumber: true, customerName: true } },
          garmentType: { select: { name: true } },
        },
      })
    : [];

  const rows: SlotGarmentRow[] = garments.map((garment) => ({
    id: garment.id,
    garmentCode: garment.garmentCode,
    orderId: garment.order.id,
    orderNumber: garment.order.orderNumber,
    customerName: garment.order.customerName,
    typeName: garment.garmentType.name,
    status: garment.status,
    since: garment.updatedAt,
  }));

  const columns: Column<SlotGarmentRow>[] = [
    {
      key: "code",
      header: "Garment",
      cell: (row) => (
        <Link
          href={`/garments/${row.garmentCode}`}
          className="font-mono text-sm font-semibold text-primary hover:underline"
        >
          {row.garmentCode}
        </Link>
      ),
    },
    { key: "type", header: "Type", cell: (row) => <span className="text-sm">{row.typeName}</span> },
    {
      key: "order",
      header: "Order",
      cell: (row) => (
        <div className="min-w-0">
          <Link href={`/orders/${row.orderId}`} className="font-mono text-sm hover:underline">
            {row.orderNumber}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{row.customerName}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          status={row.status}
          label={GARMENT_STATUS_LABELS[row.status as keyof typeof GARMENT_STATUS_LABELS]}
        />
      ),
    },
    {
      key: "since",
      header: "Filed",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.since)}</span>
      ),
    },
    ...(canAssign
      ? [
          {
            key: "move",
            header: "",
            className: "text-right",
            cell: (row: SlotGarmentRow) => (
              <MoveGarmentDialog
                garmentId={row.id}
                garmentCode={row.garmentCode}
                currentSlotLabel={`${rack.code}-${selectedSlot?.code ?? ""}`}
                slots={slotOptions}
              />
            ),
          } satisfies Column<SlotGarmentRow>,
        ]
      : []),
  ];

  const nextSlotNumber = rack.slots.length + 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Rack ${rack.code} — ${rack.name}`}
        description={`${rack.branch.name} · ${rack.slots.length} slots`}
        actions={
          <>
            <Button asChild variant="outline" size="icon" aria-label="Back to racks">
              <Link href="/racks">
                <ArrowLeft />
              </Link>
            </Button>
            {hasPermission(user, PERMISSIONS.RACK_MANAGE) ? (
              <GenerateSlotsDialog
                rackId={rack.id}
                rackCode={rack.code}
                startAt={nextSlotNumber}
              />
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Slots</CardTitle>
          </CardHeader>
          <CardContent>
            {rack.slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No slots on this rack yet.</p>
            ) : (
              <ul className="space-y-1">
                {rack.slots.map((slot) => {
                  const active = slot.id === selectedSlot?.id;
                  return (
                    <li key={slot.id}>
                      <Link
                        href={`/racks/${rack.id}?slot=${slot.id}`}
                        className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                          active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/60"
                        }`}
                      >
                        <span className="font-mono">{slot.code}</span>
                        <Badge
                          tone={
                            slot._count.garments >= slot.capacity
                              ? "danger"
                              : slot._count.garments > 0
                                ? "success"
                                : "neutral"
                          }
                        >
                          {slot._count.garments}/{slot.capacity}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          {!selectedSlot ? (
            <EmptyState
              icon={Warehouse}
              title="Select a slot"
              description="Pick a slot on the left to see exactly which garments are stored in it."
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  Slot {rack.code} · {selectedSlot.code}
                  {selectedSlot.label ? ` — ${selectedSlot.label}` : ""}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedSlot._count.garments} of {selectedSlot.capacity} garments
                </p>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={columns}
                  rows={rows}
                  getRowKey={(row) => row.id}
                  className="border-0"
                  empty={
                    <EmptyState
                      title="Slot is empty"
                      description="Garments appear here once the packing station files them into this slot."
                    />
                  }
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
