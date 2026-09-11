import Link from "next/link";
import { MapPin, Navigation, Package, Phone, Truck, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  CompleteDeliveryDialog,
  DispatchControl,
  PickupStatusControl,
} from "@/app/(app)/delivery/delivery-controls";
import { prisma } from "@/lib/prisma";
import { formatCurrency, num } from "@/lib/money";
import { formatTime, todayRange } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";

export const metadata = { title: "My jobs" };

export default async function DriverPage() {
  const user = await requirePermission(PERMISSIONS.DELIVERY_DRIVE);
  const today = todayRange();

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
    select: { id: true, vehicleNumber: true, isAvailable: true },
  });

  if (!driver) {
    return (
      <div className="space-y-5">
        <PageHeader title="My jobs" />
        <EmptyState
          icon={Truck}
          title="No driver profile"
          description="Your account has driver permissions but no driver profile yet. Ask your branch manager to add your vehicle details."
        />
      </div>
    );
  }

  const [pickups, deliveries, collectedToday] = await Promise.all([
    prisma.pickup.findMany({
      where: {
        driverId: driver.id,
        status: { notIn: ["RECEIVED_AT_LAUNDRY", "CANCELLED"] },
      },
      orderBy: { scheduledAt: "asc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalPieces: true,
            paymentStatus: true,
          },
        },
      },
    }),
    prisma.delivery.findMany({
      where: {
        driverId: driver.id,
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
      orderBy: { scheduledAt: "asc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalPieces: true,
            paymentStatus: true,
          },
        },
      },
    }),
    prisma.payment.aggregate({
      where: {
        receivedById: user.id,
        state: "CAPTURED",
        paidAt: { gte: today.from, lte: today.to },
      },
      _sum: { amount: true },
    }),
  ]);

  const toCollect = deliveries.reduce(
    (sum, delivery) => sum + num(delivery.amountToCollect),
    0,
  );
  const canCollect = hasPermission(user, PERMISSIONS.DELIVERY_COLLECT_PAYMENT);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={
          driver.vehicleNumber
            ? `Vehicle ${driver.vehicleNumber} · ${user.branchName ?? ""}`
            : (user.branchName ?? "")
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pickups" value={pickups.length} icon={Package} />
        <StatCard label="Deliveries" value={deliveries.length} icon={Truck} tone="info" />
        <StatCard
          label="Collected today"
          value={formatCurrency(collectedToday._sum.amount ?? 0)}
          icon={Wallet}
          tone="success"
          hint={`${formatCurrency(toCollect)} still to collect`}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Deliveries ({deliveries.length})
        </h2>

        {deliveries.length === 0 ? (
          <EmptyState title="No deliveries assigned" description="Nothing to drop off right now." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {deliveries.map((delivery) => (
              <Card key={delivery.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="font-mono text-base">
                      {delivery.deliveryNumber}
                    </CardTitle>
                    <Link
                      href={`/orders/${delivery.order.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {delivery.order.orderNumber} · {delivery.order.totalPieces} pcs
                    </Link>
                  </div>
                  <StatusBadge status={delivery.status} dot />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{delivery.contactName}</p>
                    <a
                      href={`tel:${delivery.contactPhone}`}
                      className="flex items-center gap-1.5 font-mono text-muted-foreground hover:underline"
                    >
                      <Phone className="size-3.5" /> {delivery.contactPhone}
                    </a>
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {delivery.addressLine}
                        {delivery.landmark ? `, ${delivery.landmark}` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Scheduled {formatTime(delivery.scheduledAt)}
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Collect</p>
                      <p className="text-lg font-semibold numeric">
                        {formatCurrency(delivery.amountToCollect)}
                      </p>
                    </div>
                    <StatusBadge status={delivery.order.paymentStatus} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.addressLine)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Navigation /> Navigate
                      </a>
                    </Button>
                    {delivery.status === "DRIVER_ASSIGNED" ? (
                      <DispatchControl deliveryId={delivery.id} />
                    ) : null}
                    {delivery.status === "OUT_FOR_DELIVERY" ||
                    delivery.status === "RESCHEDULED" ||
                    delivery.status === "FAILED" ? (
                      <CompleteDeliveryDialog
                        deliveryId={delivery.id}
                        deliveryNumber={delivery.deliveryNumber}
                        amountToCollect={num(delivery.amountToCollect)}
                        canCollect={canCollect}
                        trigger={<Button size="sm">Close out</Button>}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pickups ({pickups.length})
        </h2>

        {pickups.length === 0 ? (
          <EmptyState title="No pickups assigned" description="Nothing to collect right now." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pickups.map((pickup) => (
              <Card key={pickup.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="font-mono text-base">
                      {pickup.pickupNumber}
                    </CardTitle>
                    <Link
                      href={`/orders/${pickup.order.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {pickup.order.orderNumber}
                    </Link>
                  </div>
                  <StatusBadge status={pickup.status} dot />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{pickup.contactName}</p>
                    <a
                      href={`tel:${pickup.contactPhone}`}
                      className="flex items-center gap-1.5 font-mono text-muted-foreground hover:underline"
                    >
                      <Phone className="size-3.5" /> {pickup.contactPhone}
                    </a>
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {pickup.addressLine}
                        {pickup.landmark ? `, ${pickup.landmark}` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Scheduled {formatTime(pickup.scheduledAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup.addressLine)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Navigation /> Navigate
                      </a>
                    </Button>
                    <PickupStatusControl pickupId={pickup.id} status={pickup.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
