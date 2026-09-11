import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Barcode, QrCode } from "@/components/shared/code-image";
import { PrintButton } from "@/components/shared/print-button";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/rbac";
import { assertBranchAccess, requirePermission } from "@/lib/session";

export const metadata = { title: "Garment tags" };

export default async function OrderTagsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.GARMENT_VIEW);

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true, code: true } },
      garments: {
        orderBy: { garmentCode: "asc" },
        include: {
          garmentType: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
  });

  if (!order) notFound();
  assertBranchAccess(user, order.branchId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Tags for {order.orderNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.garments.length} tags · one per tracked garment
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/orders/${order.id}`}>
              <ArrowLeft /> Back to order
            </Link>
          </Button>
          <PrintButton label="Print tags" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {order.garments.map((garment) => (
          <div
            key={garment.id}
            className="break-inside-avoid rounded-lg border border-border bg-white p-3 text-black"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-lg font-bold leading-tight">
                  {garment.garmentCode}
                </p>
                <p className="truncate text-xs">{garment.garmentType.name}</p>
                <p className="truncate text-[11px] text-neutral-600">
                  {garment.service.name}
                </p>
              </div>
              <QrCode value={garment.qrPayload} size={72} />
            </div>
            <div className="mt-2">
              <Barcode value={garment.barcodeValue} height={36} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-600">
              <span className="font-mono">{order.orderNumber}</span>
              <span>{order.customerName}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-neutral-600">
              <span>{order.branch.code}</span>
              <span>Due {formatDate(order.expectedDeliveryAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
