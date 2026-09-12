"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, MapPin, PackageSearch, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Scanner } from "@/components/shared/scanner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineEntry } from "@/components/shared/timeline";
import { EmptyState } from "@/components/shared/empty-state";
import { formatTime, formatDateTime } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { lookupCodeAction, type ScanResult } from "@/app/(app)/garments/actions";

export function ScanStation() {
  const router = useRouter();
  const [result, setResult] = useState<ScanResult["garment"] | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const handleScan = async (code: string) => {
    const response = await lookupCodeAction({ code });

    if (!response.ok) {
      toast.error(response.error);
      return;
    }

    if (response.data.kind === "order" && response.data.order) {
      toast.success(`Opening ${response.data.order.orderNumber}`);
      router.push(`/orders/${response.data.order.id}`);
      return;
    }

    const garment = response.data.garment;
    if (!garment) return;

    setResult(garment);
    setRecent((current) =>
      [garment.garmentCode, ...current.filter((c) => c !== garment.garmentCode)].slice(0, 8),
    );
  };

  const timeline: TimelineEntry[] = (result?.history ?? [])
    .slice()
    .reverse()
    .map((entry) => ({
      id: entry.id,
      time: formatTime(entry.at),
      title: humanize(entry.status),
      description: entry.note,
      meta: `${humanize(entry.stage)}${entry.user ? ` · ${entry.user}` : ""} · ${formatDateTime(entry.at)}`,
      tone:
        entry.status.includes("FAILED") ||
        entry.status === "LOST" ||
        entry.status === "DAMAGED" ||
        entry.status === "REWASH" ||
        entry.status === "REWORK"
          ? "danger"
          : entry.status === "DELIVERED" || entry.status === "READY"
            ? "success"
            : "default",
    }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Scan a garment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Scanner onScan={handleScan} />
            <p className="text-xs text-muted-foreground">
              Accepts garment codes (G1001), order numbers (ORD10245), QR codes and
              CODE128 barcodes.
            </p>
          </CardContent>
        </Card>

        {recent.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent scans</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {recent.map((code) => (
                <Button
                  key={code}
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  onClick={() => void handleScan(code)}
                >
                  {code}
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="lg:col-span-3">
        {!result ? (
          <EmptyState
            icon={PackageSearch}
            title="Nothing scanned yet"
            description="Scan or type a garment code to see exactly where it is, who touched it last, and its full processing history."
            className="h-full"
          />
        ) : (
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="font-mono text-2xl">
                  {result.garmentCode}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.typeName} · {result.serviceName}
                </p>
              </div>
              <StatusBadge status={result.status} label={result.statusLabel} dot />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoBlock
                  icon={MapPin}
                  label="Current location"
                  value={result.location ?? `On the floor · ${result.stageLabel}`}
                  highlight={Boolean(result.location)}
                />
                <InfoBlock
                  icon={History}
                  label="Last scanned"
                  value={
                    result.lastScannedAt
                      ? `${result.lastScannedAt}${result.lastScannedBy ? ` by ${result.lastScannedBy}` : ""}`
                      : "Never scanned"
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Order</span>
                <Link
                  href={`/orders/${result.orderId}`}
                  className="font-mono font-semibold text-primary hover:underline"
                >
                  {result.orderNumber}
                </Link>
                <span className="text-muted-foreground">· {result.customerName}</span>
              </div>

              {result.stainNotes || result.damageNotes ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldAlert className="size-4" /> Handling notes
                  </p>
                  {result.stainNotes ? <p className="mt-1">Stains: {result.stainNotes}</p> : null}
                  {result.damageNotes ? <p>Damage: {result.damageNotes}</p> : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/garments/${result.garmentCode}`}>Full garment record</Link>
                </Button>
                {result.pendingStage ? (
                  <Button asChild size="sm">
                    <Link href={`/processing/${result.pendingStage.toLowerCase()}`}>
                      Go to {humanize(result.pendingStage)} station
                    </Link>
                  </Button>
                ) : null}
              </div>

              <Separator />

              <div>
                <h3 className="mb-3 text-sm font-semibold">Processing history</h3>
                <Timeline entries={timeline} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${highlight ? "border-success/40 bg-success/8" : "border-border"}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
