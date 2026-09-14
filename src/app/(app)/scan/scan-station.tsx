"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  History,
  Printer,
  ScanLine,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { signalDataChange } from "@/components/shared/live-refresh";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Scanner } from "@/components/shared/scanner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/money";
import { formatDate, formatDateTime, formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ScanHistoryRow, ScanResult } from "@/lib/services/scanning";

import { scanGarmentAction, scanHistoryAction, scanUpdateStatusAction } from "./actions";

interface Props {
  history: ScanHistoryRow[];
  canUpdateStatus: boolean;
  canResolve: boolean;
}

interface OrderContext {
  id: string;
  orderNumber: string;
  customerName: string;
}

export function ScanStation({ history: initialHistory, canUpdateStatus, canResolve }: Props) {
  const router = useRouter();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [context, setContext] = useState<OrderContext | null>(null);
  const [contextInput, setContextInput] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [history, setHistory] = useState(initialHistory);
  const [clearedAt, setClearedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const visibleHistory = clearedAt
    ? history.filter((row) => new Date(row.scannedAt).getTime() > clearedAt)
    : history;

  const refreshHistory = useCallback(() => {
    startTransition(async () => {
      const res = await scanHistoryAction({});
      if (res.ok) setHistory(res.data);
    });
  }, []);

  const runScan = useCallback(
    (code: string, source: "KEYBOARD" | "CAMERA" = "KEYBOARD") =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          const res = await scanGarmentAction({
            code,
            source,
            contextOrderId: context?.id ?? null,
          });
          if (!res.ok) {
            toast.error(res.error);
            resolve();
            return;
          }

          setResult(res.data);
          if (res.data.kind === "FOUND") {
            toast.success(res.data.message);
          } else if (res.data.kind === "DUPLICATE") {
            toast.info(res.data.message);
          } else {
            toast.error(res.data.message);
          }
          refreshHistory();
          resolve();
        });
      }),
    [context, refreshHistory],
  );

  const scanNext = useCallback(() => {
    setResult(null);
  }, []);

  const setOrderContext = useCallback(() => {
    const value = contextInput.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await scanGarmentAction({ code: value, source: "KEYBOARD" });
      if (res.ok && res.data.garment) {
        setContext({
          id: res.data.garment.orderId,
          orderNumber: res.data.garment.orderNumber,
          customerName: res.data.garment.customerName,
        });
        setContextInput("");
        toast.success(`Scanning for ${res.data.garment.orderNumber} — mismatches will be caught`);
      } else {
        toast.error("No order matches that code");
      }
      refreshHistory();
    });
  }, [contextInput, refreshHistory]);

  const status =
    result === null
      ? "Ready to scan"
      : result.kind === "FOUND"
        ? "Garment found"
        : result.kind === "DUPLICATE"
          ? "Already scanned"
          : result.kind === "MISMATCH"
            ? "Mismatch detected"
            : "Tag not found";

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <Card className="border-primary/30">
          <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="size-5 text-primary" /> Scan Garment
            </CardTitle>
            <div className="flex items-center gap-2">
              {context ? (
                <Badge tone="info" className="gap-1.5">
                  Working on {context.orderNumber} · {context.customerName}
                  <button
                    type="button"
                    onClick={() => setContext(null)}
                    aria-label="Clear order context"
                    className="ml-1 rounded-full hover:bg-black/10"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ) : null}
              <Badge tone="neutral" className="whitespace-nowrap">
                {status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "relative overflow-hidden rounded-lg",
                pending && "scan-sweep",
              )}
            >
              <Scanner
                variant="workstation"
                onScan={(code, source) => runScan(code, source === "camera" ? "CAMERA" : "KEYBOARD")}
                placeholder="Scan a garment tag, or type its code (TR-1042)…"
                debounceMs={600}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Works with a camera, a USB or Bluetooth scanner (they type like a
              keyboard), QR codes and CODE128 barcodes. Every scan resolves
              instantly below — no need to reopen anything between garments.
            </p>

            {!context ? (
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Input
                  value={contextInput}
                  onChange={(event) => setContextInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setOrderContext();
                    }
                  }}
                  placeholder="Optional: scan/enter an order to catch stray garments"
                  className="h-9 font-mono text-sm"
                />
                <Button size="sm" variant="outline" onClick={setOrderContext} disabled={pending}>
                  Set order
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div ref={resultRef}>
          {result ? (
            <ResultPanel
              result={result}
              canUpdateStatus={canUpdateStatus}
              canResolve={canResolve}
              pending={pending || statusPending}
              onScanNext={scanNext}
              onSearchManually={() => manualInputRef.current?.focus()}
              onUpdateStatus={(garmentId) =>
                startStatusTransition(async () => {
                  const res = await scanUpdateStatusAction({ garmentId });
                  if (res.ok) {
                    toast.success(
                      res.data.nextStage
                        ? `Moved on to ${res.data.nextStage.replace(/_/g, " ").toLowerCase()}`
                        : `Now ${res.data.status.replace(/_/g, " ").toLowerCase()}`,
                    );
                    signalDataChange();
                    router.refresh();
                    scanNext();
                  } else {
                    toast.error(res.error);
                  }
                })
              }
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <ScanLine className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Scan → see the owner → verify → update → next.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Search className="size-3.5" /> Enter Garment ID / Order ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (manualQuery.trim()) {
                  void runScan(manualQuery.trim());
                  setManualQuery("");
                }
              }}
            >
              <Input
                ref={manualInputRef}
                value={manualQuery}
                onChange={(event) => setManualQuery(event.target.value)}
                placeholder="TR-1042"
                className="h-9"
              />
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Find Garment
              </Button>
            </form>
          </CardContent>
        </Card>

        {visibleHistory.length > 0 ? (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <History className="size-3.5" /> Recent Scans
            </p>
            <div className="flex flex-wrap gap-1.5">
              {visibleHistory.slice(0, 20).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    if (row.garmentCode) void runScan(row.garmentCode);
                    else if (row.orderNumber) void runScan(row.orderNumber);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs transition hover:bg-accent",
                    row.succeeded
                      ? "border-success/40 bg-success/5"
                      : "border-warning/40 bg-warning/5",
                  )}
                  title={row.message ?? undefined}
                >
                  {row.succeeded ? "🟢" : "🔴"} {row.garmentCode ?? row.orderNumber ?? row.rawCode}
                  {row.customerName ? (
                    <span className="text-muted-foreground">— {row.customerName}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Card className="h-fit min-w-0">
        <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" /> Scan log
          </CardTitle>
          {visibleHistory.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setClearedAt(Date.now())}
            >
              <Trash2 /> Clear history
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1.5">
          {visibleHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing scanned yet.
            </p>
          ) : (
            <ol className="max-h-[600px] space-y-1 overflow-y-auto pr-1">
              {visibleHistory.map((row) => (
                <li key={row.id}>
                  <ScanHistoryItem
                    row={row}
                    onReopen={(code) => void runScan(code)}
                  />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const PIPELINE: { token: string; label: string }[] = [
  { token: "WASH", label: "Washing" },
  { token: "DRI", label: "Drying" },
  { token: "IRON", label: "Ironing" },
  { token: "PACK", label: "Packing" },
  { token: "READY", label: "Ready" },
  { token: "DELIVERED", label: "Delivered" },
];

function pipelineIndex(status: string): number {
  const index = PIPELINE.findIndex((step) => status.startsWith(step.token));
  return index === -1 ? 0 : index;
}

function StageStepper({ status }: { status: string }) {
  const current = pipelineIndex(status);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PIPELINE.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <div key={step.token} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition",
                done && "bg-success/15 text-success",
                active && "bg-primary text-primary-foreground",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : null}
              {step.label}
            </span>
            {index < PIPELINE.length - 1 ? (
              <ArrowRight className="size-3 text-muted-foreground/50" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ResultPanel({
  result,
  canUpdateStatus,
  canResolve,
  pending,
  onScanNext,
  onSearchManually,
  onUpdateStatus,
}: {
  result: ScanResult;
  canUpdateStatus: boolean;
  canResolve: boolean;
  pending: boolean;
  onScanNext: () => void;
  onSearchManually: () => void;
  onUpdateStatus: (garmentId: string) => void;
}) {
  if (result.kind === "MISMATCH" && result.mismatch) {
    return <MismatchPanel mismatch={result.mismatch} canResolve={canResolve} onScanNext={onScanNext} />;
  }

  if (result.kind === "NOT_FOUND") {
    return (
      <Card className="animate-shake border-warning/60 bg-warning/5">
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold">⚠️ QR code not recognized</p>
              <p className="text-sm text-muted-foreground">{result.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onScanNext}>
              <ScanLine /> Scan again
            </Button>
            <Button size="sm" variant="outline" onClick={onSearchManually}>
              <Search /> Search manually
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const garment = result.garment;
  if (!garment) return null;

  const isDuplicate = result.kind === "DUPLICATE";

  return (
    <Card
      key={garment.garmentId + result.kind}
      className={cn(
        "animate-pop",
        isDuplicate ? "border-warning/50 bg-warning/5" : "border-success/50 bg-success/5",
      )}
    >
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-semibold">
              {isDuplicate ? "🟡 Already scanned" : "🟢 Garment found"}
            </p>
            {isDuplicate ? (
              <p className="text-sm text-muted-foreground">{result.message}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This garment belongs to <span className="font-medium text-foreground">{garment.customerName}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xl font-bold tracking-tight">
            {garment.garmentCode}
          </span>
          <Badge tone="info">
            {garment.categoryEmoji} {garment.categoryLabel}
          </Badge>
          <StatusBadge status={garment.status} label={garment.statusLabel} dot />
        </div>

        {garment.warning ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
            <span>{garment.warning}</span>
          </div>
        ) : null}

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="Customer">
            <Link href={garment.customerId ? `/customers/${garment.customerId}` : "#"} className="hover:underline">
              {garment.customerName}
            </Link>
            <span className="block font-mono text-xs text-muted-foreground">
              {garment.customerPhone}
            </span>
          </Fact>
          <Fact label="Order">
            <Link href={`/orders/${garment.orderId}`} className="font-mono text-primary hover:underline">
              {garment.orderNumber}
            </Link>
          </Fact>
          <Fact label="Order items">{garment.orderItemsSummary || "—"}</Fact>
          <Fact label="Current status">
            {garment.statusLabel} · {garment.stageLabel}
          </Fact>
          <Fact label="Payment / balance">
            {formatCurrency(garment.paidAmount)} of {formatCurrency(garment.totalAmount)} paid
            {garment.outstandingAmount > 0 ? (
              <span className="block text-xs font-medium text-destructive">
                {formatCurrency(garment.outstandingAmount)} due
              </span>
            ) : null}
          </Fact>
          <Fact label="Delivery date">{formatDate(garment.expectedDeliveryAt)}</Fact>
        </dl>

        {!isDuplicate ? (
          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Laundry status
            </p>
            <StageStepper status={garment.status} />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {canUpdateStatus && !isDuplicate ? (
            <Button size="sm" disabled={pending} onClick={() => onUpdateStatus(garment.garmentId)}>
              <ArrowRight /> Update status
            </Button>
          ) : null}
          <Button size="sm" variant="outline" asChild>
            <Link href={`/orders/${garment.orderId}`}>
              <ExternalLink /> View order
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/orders/${garment.orderId}/tags`}>
              <Printer /> {garment.lastScannedAt ? "Reprint tag" : "Print tag"}
            </Link>
          </Button>
          <Button size="sm" onClick={onScanNext}>
            <ScanLine /> Scan next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MismatchPanel({
  mismatch,
  canResolve,
  onScanNext,
}: {
  mismatch: NonNullable<ScanResult["mismatch"]>;
  canResolve: boolean;
  onScanNext: () => void;
}) {
  return (
    <Card className="animate-shake border-destructive/60 bg-destructive/5">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-destructive">🔴 Mismatch detected</p>
            <p className="text-sm text-muted-foreground">{mismatch.detail}</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="Scanned garment">
            <span className="font-mono">{mismatch.garmentCode}</span> · {mismatch.categoryLabel}
          </Fact>
          <Fact label="Actual customer">{mismatch.actualCustomerName}</Fact>
          <Fact label="Actual order">
            <Link href={`/orders/${mismatch.actualOrderId}`} className="font-mono text-primary hover:underline">
              {mismatch.actualOrderNumber}
            </Link>
          </Fact>
          <Fact label="Expected order">{mismatch.expectedOrderNumber ?? "—"}</Fact>
          <Fact label="Expected category">{mismatch.expectedCategoryLabel ?? "—"}</Fact>
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-destructive/20 pt-4">
          <Button size="sm" asChild>
            <Link href={`/orders/${mismatch.actualOrderId}`}>
              <ExternalLink /> View correct order
            </Link>
          </Button>
          {canResolve ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/mismatch?q=${mismatch.garmentCode}`}>
                <ArrowRight /> Correct assignment
              </Link>
            </Button>
          ) : null}
          <Button size="sm" onClick={onScanNext}>
            <ScanLine /> Scan again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

function ScanHistoryItem({ row, onReopen }: { row: ScanHistoryRow; onReopen: (code: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onReopen(row.garmentCode ?? row.orderNumber ?? row.rawCode)}
      className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-accent"
    >
      {row.succeeded ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-sm font-medium">
            {row.garmentCode ?? row.orderNumber ?? row.rawCode}
          </span>
          <TimeAgo value={row.scannedAt} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.customerName ?? row.message ?? row.resolvedAs}
        </span>
      </span>
    </button>
  );
}

/**
 * Relative timestamps depend on "now" and the reader's timezone, neither of
 * which the server shares, so they render after mount rather than during
 * hydration.
 */
function TimeAgo({ value }: { value: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <span
      className="shrink-0 text-[11px] text-muted-foreground"
      title={mounted ? formatDateTime(value) : undefined}
      suppressHydrationWarning
    >
      {mounted ? formatRelative(value) : ""}
    </span>
  );
}
