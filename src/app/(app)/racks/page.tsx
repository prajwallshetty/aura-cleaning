import Link from "next/link";
import { Warehouse } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { NewRackDialog } from "@/app/(app)/racks/rack-dialogs";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";
import {
  branchOptions,
  scopedBranchId,
  type SearchParams,
} from "@/lib/queries/filters";

export const metadata = { title: "Rack & Location" };

export default async function RacksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await requirePermission(PERMISSIONS.RACK_VIEW);
  const branchId = scopedBranchId(user, params);

  const [racks, branches, unracked, racked] = await Promise.all([
    prisma.rack.findMany({
      where: { ...(branchId ? { branchId } : {}) },
      orderBy: [{ branchId: "asc" }, { code: "asc" }],
      include: {
        branch: { select: { name: true, code: true } },
        slots: {
          orderBy: { code: "asc" },
          include: { _count: { select: { garments: true } } },
        },
      },
    }),
    branchOptions(user),
    prisma.garment.count({
      where: {
        rackSlotId: null,
        status: { in: ["PACKED", "READY"] },
        ...(branchId ? { branchId } : {}),
      },
    }),
    prisma.garment.count({
      where: { rackSlotId: { not: null }, ...(branchId ? { branchId } : {}) },
    }),
  ]);

  const totalSlots = racks.reduce((sum, rack) => sum + rack.slots.length, 0);
  const totalCapacity = racks.reduce(
    (sum, rack) => sum + rack.slots.reduce((s, slot) => s + slot.capacity, 0),
    0,
  );

  const canManage = hasPermission(user, PERMISSIONS.RACK_MANAGE);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rack & location"
        description="Physical storage map. Search any order or garment code to find its slot."
        actions={
          canManage ? (
            <NewRackDialog branches={branches} defaultBranchId={user.branchId} />
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Racks" value={racks.length} icon={Warehouse} />
        <StatCard label="Slots" value={totalSlots} />
        <StatCard label="Garments racked" value={racked} tone="success" />
        <StatCard
          label="Packed, not racked"
          value={unracked}
          tone={unracked > 0 ? "warning" : "default"}
          hint="Waiting to be filed"
        />
      </div>

      {branches.length > 1 ? (
        <FilterBar
          showSearch={false}
          filters={[{ name: "branch", label: "Branch", options: branches }]}
        />
      ) : null}

      {racks.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No racks configured"
          description="Create a rack and generate its slots so packed orders have a home."
        />
      ) : (
        <div className="space-y-4">
          {racks.map((rack) => {
            const occupied = rack.slots.reduce(
              (sum, slot) => sum + slot._count.garments,
              0,
            );
            const capacity = rack.slots.reduce((sum, slot) => sum + slot.capacity, 0);
            const utilisation = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;

            return (
              <Card key={rack.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Link href={`/racks/${rack.id}`} className="hover:underline">
                        Rack {rack.code} — {rack.name}
                      </Link>
                      {!rack.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rack.branch.name} · {rack.slots.length} slots · {occupied}/{capacity}{" "}
                      garments
                    </p>
                  </div>
                  <div className="w-28 shrink-0 space-y-1">
                    <Progress
                      value={utilisation}
                      indicatorClassName={
                        utilisation > 85
                          ? "bg-destructive"
                          : utilisation > 60
                            ? "bg-warning"
                            : "bg-success"
                      }
                    />
                    <p className="text-right text-xs text-muted-foreground numeric">
                      {utilisation}% full
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  {rack.slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No slots yet.{" "}
                      <Link href={`/racks/${rack.id}`} className="text-primary hover:underline">
                        Add some
                      </Link>
                      .
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {rack.slots.map((slot) => {
                        const count = slot._count.garments;
                        const full = count >= slot.capacity;
                        return (
                          <Link
                            key={slot.id}
                            href={`/racks/${rack.id}?slot=${slot.id}`}
                            className={`flex min-w-14 flex-col items-center rounded-md border px-2 py-1.5 text-center transition-colors ${
                              !slot.isActive
                                ? "border-dashed border-border text-muted-foreground"
                                : full
                                  ? "border-destructive/40 bg-destructive/8 text-destructive"
                                  : count > 0
                                    ? "border-success/40 bg-success/10 text-success"
                                    : "border-border hover:bg-muted/60"
                            }`}
                          >
                            <span className="font-mono text-xs font-semibold">
                              {slot.code}
                            </span>
                            <span className="text-[10px] numeric">
                              {count}/{slot.capacity}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
