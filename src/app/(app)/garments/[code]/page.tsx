import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Barcode, QrCode } from "@/components/shared/code-image";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineEntry } from "@/components/shared/timeline";
import { GarmentTools } from "@/app/(app)/garments/[code]/garment-tools";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatTime } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/rbac";
import { assertBranchAccess, hasPermission, requirePermission } from "@/lib/session";
import { humanize } from "@/lib/utils";
import {
  GARMENT_STATUS_LABELS,
  STAGE_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/workflow";

export const metadata = { title: "Garment" };

export default async function GarmentDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requirePermission(PERMISSIONS.GARMENT_VIEW);

  const garment = await prisma.garment.findUnique({
    where: { garmentCode: decodeURIComponent(code).toUpperCase() },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          expectedDeliveryAt: true,
          status: true,
        },
      },
      garmentType: { select: { name: true, category: true } },
      service: { select: { name: true } },
      branch: { select: { name: true, code: true } },
      rackSlot: {
        select: { code: true, label: true, rack: { select: { code: true, name: true } } },
      },
      lastScannedBy: { select: { name: true } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      locationHistory: {
        orderBy: { createdAt: "asc" },
        include: {
          fromSlot: { select: { code: true, rack: { select: { code: true } } } },
          toSlot: { select: { code: true, rack: { select: { code: true } } } },
        },
      },
      tasks: {
        orderBy: { sequence: "asc" },
        include: { assignedTo: { select: { name: true } } },
      },
      photos: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      complaints: {
        select: { id: true, complaintNumber: true, type: true, status: true },
      },
    },
  });

  if (!garment) notFound();
  assertBranchAccess(user, garment.branchId);

  const statusTimeline: TimelineEntry[] = garment.statusHistory.map((entry) => ({
    id: entry.id,
    time: formatTime(entry.createdAt),
    title: GARMENT_STATUS_LABELS[entry.toStatus],
    description: entry.note,
    meta: `${STAGE_LABELS[entry.stage]}${entry.userName ? ` · ${entry.userName}` : ""} · ${formatDateTime(entry.createdAt)}`,
    tone:
      ["QC_FAILED", "REWASH", "REWORK", "LOST", "DAMAGED"].includes(entry.toStatus)
        ? "danger"
        : ["READY", "PACKED", "DELIVERED", "QC_PASSED"].includes(entry.toStatus)
          ? "success"
          : "default",
  }));

  const locationTimeline: TimelineEntry[] = garment.locationHistory.map((entry) => ({
    id: entry.id,
    time: formatTime(entry.createdAt),
    title: entry.toSlot
      ? `Moved to ${entry.toSlot.rack.code} · ${entry.toSlot.code}`
      : "Removed from rack",
    description: entry.fromSlot
      ? `From ${entry.fromSlot.rack.code} · ${entry.fromSlot.code}`
      : null,
    meta: `${entry.userName ?? "System"} · ${formatDateTime(entry.createdAt)}`,
    tone: entry.toSlot ? "success" : "default",
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={garment.garmentCode}
        description={`${garment.garmentType.name} · ${garment.service.name}`}
        actions={
          <>
            <Button asChild variant="outline" size="icon" aria-label="Back">
              <Link href="/garments">
                <ArrowLeft />
              </Link>
            </Button>
            <GarmentTools
              garmentId={garment.id}
              garmentCode={garment.garmentCode}
              canEdit={hasPermission(user, PERMISSIONS.GARMENT_UPDATE)}
              canUpload={hasPermission(user, PERMISSIONS.GARMENT_PHOTO_UPLOAD)}
              details={{
                color: garment.color,
                brand: garment.brand,
                size: garment.size,
                fabric: garment.fabric,
                stainNotes: garment.stainNotes,
                damageNotes: garment.damageNotes,
              }}
            />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={garment.status}
            label={GARMENT_STATUS_LABELS[garment.status]}
            dot
          />
          <StatusBadge
            status={garment.currentStage}
            label={STAGE_LABELS[garment.currentStage]}
            tone="neutral"
          />
          {garment.rewashCount > 0 ? (
            <StatusBadge
              status="REWASH"
              tone="warning"
              label={`${garment.rewashCount} rewash${garment.rewashCount > 1 ? "es" : ""}`}
            />
          ) : null}
          {garment.reworkCount > 0 ? (
            <StatusBadge
              status="REWORK"
              tone="warning"
              label={`${garment.reworkCount} rework${garment.reworkCount > 1 ? "s" : ""}`}
            />
          ) : null}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            className={
              garment.rackSlot ? "border-success/40 bg-success/5" : undefined
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4" /> Where is it right now?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {garment.rackSlot ? (
                <p className="text-2xl font-semibold">
                  {garment.branch.name} → Rack {garment.rackSlot.rack.code} → Slot{" "}
                  <span className="font-mono">{garment.rackSlot.code}</span>
                </p>
              ) : (
                <p className="text-2xl font-semibold">
                  On the floor at {STAGE_LABELS[garment.currentStage]}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {garment.lastScannedAt
                  ? `Last scanned ${formatDateTime(garment.lastScannedAt)}${garment.lastScannedBy ? ` by ${garment.lastScannedBy.name}` : ""}`
                  : "Not scanned since intake"}
              </p>
            </CardContent>
          </Card>

          <Tabs defaultValue="history">
            <TabsList>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="stages">Stages</TabsTrigger>
              <TabsTrigger value="location">Movement</TabsTrigger>
              <TabsTrigger value="photos">Photos ({garment.photos.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Immutable garment ledger
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Timeline entries={statusTimeline} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stages">
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 text-left">Stage</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5 text-left">Operator</th>
                        <th className="px-4 py-2.5 text-left">Completed</th>
                        <th className="px-4 py-2.5 text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {garment.tasks.map((task) => (
                        <tr key={task.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5 font-medium">
                            {STAGE_LABELS[task.stage]}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge
                              status={task.status}
                              label={TASK_STATUS_LABELS[task.status]}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {task.assignedTo?.name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {task.completedAt ? formatDateTime(task.completedAt) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right numeric text-muted-foreground">
                            {task.durationSeconds
                              ? `${Math.round(task.durationSeconds / 60)} min`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="location">
              <Card>
                <CardContent className="pt-5">
                  <Timeline entries={locationTimeline} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="photos">
              <Card>
                <CardContent className="pt-5">
                  {garment.photos.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No photos captured for this garment.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {garment.photos.map((photo) => (
                        <figure key={photo.id} className="space-y-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={photo.caption ?? `${garment.garmentCode} photo`}
                            className="aspect-square w-full rounded-lg border border-border object-cover"
                          />
                          <figcaption className="text-xs text-muted-foreground">
                            {humanize(photo.kind)} ·{" "}
                            {formatDateTime(photo.createdAt)}
                            {photo.uploadedBy ? ` · ${photo.uploadedBy.name}` : ""}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Tag</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <QrCode value={garment.qrPayload} size={140} label={garment.garmentCode} />
              <Barcode value={garment.barcodeValue} height={44} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link
                href={`/orders/${garment.order.id}`}
                className="font-mono text-base font-semibold text-primary hover:underline"
              >
                {garment.order.orderNumber}
              </Link>
              <p>{garment.order.customerName}</p>
              <p className="font-mono text-muted-foreground">
                {garment.order.customerPhone}
              </p>
              <Separator />
              <dl className="space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Order status</dt>
                  <dd><StatusBadge status={garment.order.status} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Due</dt>
                  <dd>{formatDateTime(garment.order.expectedDeliveryAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Branch</dt>
                  <dd>{garment.branch.name}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1.5 text-sm">
                {[
                  ["Type", garment.garmentType.name],
                  ["Category", garment.garmentType.category],
                  ["Service", garment.service.name],
                  ["Colour", garment.color],
                  ["Brand", garment.brand],
                  ["Size", garment.size],
                  ["Fabric", garment.fabric],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              {garment.stainNotes || garment.damageNotes ? (
                <>
                  <Separator className="my-3" />
                  {garment.stainNotes ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Stains: </span>
                      {garment.stainNotes}
                    </p>
                  ) : null}
                  {garment.damageNotes ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Damage: </span>
                      {garment.damageNotes}
                    </p>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>

          {garment.complaints.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Complaints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {garment.complaints.map((complaint) => (
                  <Link
                    key={complaint.id}
                    href={`/complaints/${complaint.id}`}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <span className="font-mono">{complaint.complaintNumber}</span>
                    <StatusBadge status={complaint.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
