"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  BadgeIndianRupee,
  CheckCircle2,
  ExternalLink,
  History,
  MapPin,
  PackageCheck,
  Printer,
  RotateCcw,
  ScanLine,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { signalDataChange } from "@/components/shared/live-refresh";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Scanner } from "@/components/shared/scanner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/money";
import { formatDate, formatDateTime, formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  ScanHistoryRow,
  ScanOutcome,
  ScannedOrder,
} from "@/lib/services/scanning";

import {
  scanHistoryAction,
  scanPaymentAction,
  scanStatusAction,
  scanTagAction,
} from "./actions";
import {
  correctOrderAction,
  moveGarmentAction,
} from "@/app/(app)/mismatch/actions";

/** The forward path a counter operator walks an order along. */
const FLOW = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "IRONING",
  "PACKING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

const FLOW_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  WASHING: "Washing",
  DRYING: "Drying",
  IRONING: "Ironing",
  PACKING: "Packing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  ON_HOLD: "On hold",
};

interface Props {
  history: ScanHistoryRow[];
  canUpdateStatus: boolean;
  canTakePayment: boolean;
  canMove: boolean;
}

export function ScanStation({
  history: initialHistory,
  canUpdateStatus,
  canTakePayment,
  canMove,
}: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<ScannedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stray, setStray] = useState<NonNullable<
    ScanOutcome["wrongOrder"]
  > | null>(null);
  const [matched, setMatched] = useState<{ code: string; at: number } | null>(
    null,
  );
  const [history, setHistory] = useState(initialHistory);
  const [historySearch, setHistorySearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const lastCodeRef = useRef<string | null>(null);

  const refreshHistory = useCallback((search: string) => {
    startTransition(async () => {
      const result = await scanHistoryAction({ search: search || undefined });
      if (result.ok) setHistory(result.data);
    });
  }, []);

  const runScan = useCallback(
    (
      code: string,
      source: "KEYBOARD" | "CAMERA" = "KEYBOARD",
      contextOrderId?: string | null,
    ) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          const result = await scanTagAction({ code, source, contextOrderId });
          if (!result.ok) {
            setError(result.error);
            setOrder(null);
            setMatched(null);
            toast.error(result.error);
            resolve();
            return;
          }

          const outcome = result.data;
          if (!outcome.ok || !outcome.order) {
            setError(outcome.message);
            setStray(outcome.wrongOrder ?? null);
            setOrder(null);
            setMatched(null);
            toast.error(outcome.message);
          } else {
            // Rescanning a tag that is already open is a no-op, not a new
            // record: the counter is just checking they have the right bundle.
            const repeat = lastCodeRef.current === code;
            lastCodeRef.current = code;
            setError(null);
            setStray(null);
            setOrder(outcome.order);
            setMatched({ code: outcome.order.orderNumber, at: Date.now() });
            toast.success(
              repeat
                ? `${outcome.order.orderNumber} already open`
                : `${outcome.order.orderNumber} — ${outcome.order.customerName}`,
            );
          }
          refreshHistory(historySearch);
          resolve();
        });
      }),
    [historySearch, refreshHistory],
  );

  const reload = useCallback(() => {
    if (order) void runScan(order.orderNumber);
  }, [order, runScan]);

  const setStatus = useCallback(
    (status: string) => {
      if (!order) return;
      startTransition(async () => {
        const result = await scanStatusAction({ orderId: order.id, status });
        if (result.ok) {
          toast.success(
            `${order.orderNumber} is now ${FLOW_LABELS[status] ?? status}`,
          );
          signalDataChange();
          void runScan(order.orderNumber);
        } else {
          toast.error(result.error);
        }
      });
    },
    [order, runScan],
  );

  const nextStatus = order
    ? FLOW[
        Math.min(
          FLOW.indexOf(order.status as (typeof FLOW)[number]) + 1,
          FLOW.length - 1,
        )
      ]
    : null;
  const canAdvance =
    order !== null &&
    nextStatus !== null &&
    FLOW.includes(order.status as (typeof FLOW)[number]) &&
    nextStatus !== order.status;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="size-5 text-primary" /> Scan tag
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={cn(
                "relative overflow-hidden rounded-lg",
                pending && "scan-sweep",
              )}
            >
              <Scanner
                onScan={(code) => runScan(code, "KEYBOARD", order?.id ?? null)}
                placeholder="Scan a tag, or type ORD10001 / TR-1042"
                debounceMs={700}
              />
            </div>
            {matched ? (
              <div
                key={matched.at}
                className="animate-pop flex items-center gap-2 rounded-lg border border-success/50 bg-success/10 px-3 py-2.5"
                role="status"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="check-draw size-5 shrink-0 text-success"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <p className="text-sm font-medium text-success">
                  🟢 Garment matched — {matched.code} open below
                </p>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Works with a USB or Bluetooth scanner (they type like a keyboard),
              the device camera, and QR or CODE128 barcodes. Scanning the same
              tag again simply reopens the order.
            </p>
          </CardContent>
        </Card>

        {stray ? (
          <GarmentMismatchPanel
            stray={stray}
            pending={pending}
            canReassign={canUpdateStatus}
            canMove={canMove}
            onDismiss={() => {
              setStray(null);
              setError(null);
            }}
            onOpenActual={() => {
              const target = stray.actual.orderNumber;
              setOrder(null);
              setError(null);
              setStray(null);
              void runScan(target);
            }}
            onResolved={() => {
              setStray(null);
              setError(null);
              signalDataChange();
              router.refresh();
            }}
          />
        ) : error ? (
          <Card className="animate-shake border-destructive/50 bg-destructive/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="space-y-2">
                <p className="font-medium text-destructive">
                  Tag not recognised
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setError(null)}
                  >
                    <ScanLine /> Scan again
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/mismatch">Mismatch centre</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/orders">Search orders instead</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {order ? (
          <OrderCard
            order={order}
            pending={pending}
            canUpdateStatus={canUpdateStatus}
            canTakePayment={canTakePayment}
            canAdvance={canAdvance}
            nextStatus={nextStatus}
            onSetStatus={setStatus}
            onTakePayment={() => setPayOpen(true)}
            onRefresh={reload}
          />
        ) : !error ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <ScanLine className="size-10 text-muted-foreground/50" />
              <p className="font-medium">Waiting for a tag</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Point the scanner at the tag on the bundle, or type the order
                id. The order, its items, its status and what is still owed all
                appear here.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="h-fit min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" /> Scan history
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={historySearch}
            placeholder="Filter by tag, order or customer…"
            onChange={(event) => {
              setHistorySearch(event.target.value);
              refreshHistory(event.target.value);
            }}
            className="h-9"
          />
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing scanned yet.
            </p>
          ) : (
            <ol className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
              {history.map((row) => (
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

      {order ? (
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          order={order}
          onDone={() => {
            setPayOpen(false);
            void runScan(order.orderNumber);
          }}
        />
      ) : null}
    </div>
  );
}

function OrderCard({
  order,
  pending,
  canUpdateStatus,
  canTakePayment,
  canAdvance,
  nextStatus,
  onSetStatus,
  onTakePayment,
  onRefresh,
}: {
  order: ScannedOrder;
  pending: boolean;
  canUpdateStatus: boolean;
  canTakePayment: boolean;
  canAdvance: boolean;
  nextStatus: string | null;
  onSetStatus: (status: string) => void;
  onTakePayment: () => void;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-2xl font-bold tracking-tight">
                {order.orderNumber}
              </p>
              <StatusBadge status={order.status} label={order.statusLabel} />
              {order.priority !== "NORMAL" ? (
                <Badge tone="outline">{order.priority}</Badge>
              ) : null}
              {order.isOverdue ? (
                <Badge tone="danger" className="gap-1">
                  <AlertTriangle className="size-3" /> Overdue
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.customerName} · {order.customerPhone} · {order.branchName}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={pending}
          >
            <RotateCcw /> Refresh
          </Button>
        </div>

        {order.scannedGarment ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            Scanned piece{" "}
            <span className="font-mono font-semibold">
              {order.scannedGarment.code}
            </span>{" "}
            · {order.scannedGarment.categoryLabel} ·{" "}
            {order.scannedGarment.typeName} · {order.scannedGarment.serviceName}
            {order.scannedGarment.slot
              ? ` · rack ${order.scannedGarment.slot}`
              : ""}
          </div>
        ) : null}

        {order.issues.length > 0 ? (
          <div
            role="alert"
            className="space-y-1.5 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="size-4" />
              {order.issues.length} piece{order.issues.length === 1 ? "" : "s"}{" "}
              on this order need attention
            </p>
            <ul className="space-y-1 text-sm">
              {order.issues.map((issue) => (
                <li
                  key={issue.garmentId}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Link
                    href={`/garments/${issue.garmentCode}`}
                    className="font-mono font-medium text-primary hover:underline"
                  >
                    {issue.garmentCode}
                  </Link>
                  <Badge tone="danger">{issue.label}</Badge>
                  <span className="text-muted-foreground">{issue.detail}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/mismatch"
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              Open the mismatch centre →
            </Link>
          </div>
        ) : null}

        {order.categories.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pieces by category · expected vs scanned here
            </p>
            <div className="flex flex-wrap gap-2">
              {order.categories.map((entry) => {
                const complete = entry.scanned >= entry.expected;
                return (
                  <Link
                    key={entry.category}
                    href={`/tracking/${entry.category.toLowerCase()}`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition hover:bg-accent",
                      complete
                        ? "border-success/50 bg-success/5"
                        : "border-warning/50 bg-warning/5",
                    )}
                  >
                    <span aria-hidden>{entry.emoji}</span>
                    <span>{entry.label}</span>
                    <span className="numeric font-semibold">
                      {entry.scanned}/{entry.expected}
                    </span>
                    {complete ? (
                      <CheckCircle2 className="size-3.5 text-success" />
                    ) : (
                      <AlertTriangle className="size-3.5 text-warning-foreground" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Metric label="Pieces" value={String(order.totalPieces)} />
          <Metric label="Total" value={formatCurrency(order.totalAmount)} />
          <Metric label="Paid" value={formatCurrency(order.paidAmount)} />
          <Metric
            label="Balance"
            value={formatCurrency(order.outstandingAmount)}
            emphasis={order.outstandingAmount > 0}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="Booked" value={formatDate(order.placedAt)} />
          <Metric
            label="Expected delivery"
            value={formatDate(order.expectedDeliveryAt)}
            emphasis={order.isOverdue}
          />
          <Metric
            label="Location"
            value={order.rackLocation ?? "Not filed"}
            icon={order.rackLocation ? MapPin : undefined}
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Items
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span>
                  {item.quantity}× {item.label}
                </span>
                <span className="numeric">
                  {formatCurrency(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {order.specialInstructions ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="font-medium">Instructions:</span>{" "}
            {order.specialInstructions}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quick actions
          </p>
          <div className="flex flex-wrap gap-2">
            {canUpdateStatus ? (
              <>
                <Button
                  size="sm"
                  disabled={!canAdvance || pending}
                  onClick={() => nextStatus && onSetStatus(nextStatus)}
                >
                  <ArrowRight /> Update status
                  {canAdvance && nextStatus
                    ? ` → ${FLOW_LABELS[nextStatus]}`
                    : ""}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || order.status === "READY"}
                  onClick={() => onSetStatus("READY")}
                >
                  <PackageCheck /> Mark ready
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || order.status === "DELIVERED"}
                  onClick={() => onSetStatus("DELIVERED")}
                >
                  <Truck /> Mark delivered
                </Button>
              </>
            ) : null}
            {canTakePayment ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || order.outstandingAmount <= 0}
                onClick={onTakePayment}
              >
                <BadgeIndianRupee /> Take payment
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link href={`/orders/${order.id}/tags`}>
                <Printer />{" "}
                {order.tagPrintCount > 0 ? "Reprint tag" : "Print tag"}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/orders/${order.id}/receipt`}>
                <Printer /> Receipt
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/orders/${order.id}`}>
                <ExternalLink /> View order
              </Link>
            </Button>
            {order.customerId ? (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/customers/${order.customerId}`}>Customer</Link>
              </Button>
            ) : null}
          </div>
          {order.tagPrintCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              Tag printed {order.tagPrintCount}× already.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  emphasis,
  icon: Icon,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  icon?: typeof MapPin;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "flex items-center gap-1 text-sm font-semibold",
          emphasis && "text-destructive",
        )}
      >
        {Icon ? <Icon className="size-3.5" /> : null}
        {value}
      </p>
    </div>
  );
}

function ScanHistoryItem({
  row,
  onReopen,
}: {
  row: ScanHistoryRow;
  onReopen: (code: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onReopen(row.orderNumber ?? row.rawCode)}
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
            {row.orderNumber ?? row.rawCode}
          </span>
          <TimeAgo value={row.scannedAt} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.action ?? row.customerName ?? row.message ?? row.resolvedAs}
        </span>
      </span>
    </button>
  );
}

/**
 * Relative timestamps depend on "now" and on the reader's timezone, neither of
 * which the server shares, so they are rendered after mount rather than during
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

function PaymentDialog({
  open,
  onOpenChange,
  order,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ScannedOrder;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(order.outstandingAmount);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setAmount(order.outstandingAmount);
      setMethod("CASH");
      setReference("");
    }
  }, [open, order.outstandingAmount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take payment · {order.orderNumber}</DialogTitle>
          <DialogDescription>
            {formatCurrency(order.outstandingAmount)} outstanding from{" "}
            {order.customerName}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="scan-pay-amount">Amount</Label>
            <Input
              id="scan-pay-amount"
              type="number"
              min={0}
              max={order.outstandingAmount}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
              className="h-12 text-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scan-pay-ref">Reference</Label>
            <Input
              id="scan-pay-ref"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="UPI transaction id, card auth code…"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              pending || amount <= 0 || amount > order.outstandingAmount
            }
            onClick={() =>
              startTransition(async () => {
                const result = await scanPaymentAction({
                  orderId: order.id,
                  amount,
                  method,
                  reference: reference || undefined,
                });
                if (result.ok) {
                  toast.success(
                    `${formatCurrency(amount)} taken · ${formatCurrency(result.data.outstanding)} left`,
                  );
                  signalDataChange();
                  onDone();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            <BadgeIndianRupee /> Take {formatCurrency(amount)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the counter sees when a piece does not belong to the order on screen.
 *
 * The whole point is the side-by-side: expected customer, order and location
 * against the actual ones, so the operator can see at a glance whether they
 * picked up the wrong bundle or the piece was mis-tagged — and then fix it
 * without leaving the station.
 */
function GarmentMismatchPanel({
  stray,
  pending,
  canReassign,
  canMove,
  onDismiss,
  onOpenActual,
  onResolved,
}: {
  stray: NonNullable<ScanOutcome["wrongOrder"]>;
  pending: boolean;
  canReassign: boolean;
  canMove: boolean;
  onDismiss: () => void;
  onOpenActual: () => void;
  onResolved: () => void;
}) {
  const [busy, startBusy] = useTransition();
  const disabled = pending || busy;

  const rows = [
    {
      label: "Customer",
      expected: stray.expected.customerName,
      actual: stray.actual.customerName,
    },
    {
      label: "Order",
      expected: stray.expected.orderNumber,
      actual: stray.actual.orderNumber,
    },
    {
      label: "Location",
      expected: stray.expected.location,
      actual: stray.actual.location,
    },
  ];

  return (
    <Card className="animate-shake border-destructive/60 bg-destructive/5">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-destructive">
              🔴 Garment mismatch
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono font-medium">{stray.garmentCode}</span>{" "}
              · {stray.categoryLabel} · last scanned{" "}
              {stray.actual.lastScanAt
                ? formatDateTime(stray.actual.lastScanAt)
                : "never"}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-destructive/30">
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] bg-destructive/10 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="px-3 py-1.5" />
            <span className="px-3 py-1.5">Expected</span>
            <span className="px-3 py-1.5">Actual</span>
          </div>
          {rows.map((row) => {
            const same = row.expected === row.actual;
            return (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-t border-destructive/20 text-sm"
              >
                <span className="px-3 py-2 text-muted-foreground">
                  {row.label}
                </span>
                <span className="truncate px-3 py-2">{row.expected}</span>
                <span
                  className={cn(
                    "truncate px-3 py-2 font-medium",
                    same ? "" : "text-destructive",
                  )}
                >
                  {row.actual}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onOpenActual} disabled={disabled}>
            <ExternalLink /> Open {stray.actual.orderNumber}
          </Button>

          {canReassign ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                startBusy(async () => {
                  const result = await correctOrderAction({
                    garmentId: stray.garmentId,
                    orderNumber: stray.expected.orderNumber,
                  });
                  if (result.ok) {
                    toast.success(
                      `${stray.garmentCode} moved onto ${stray.expected.orderNumber}`,
                    );
                    signalDataChange();
                    onResolved();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              <ArrowRightLeft /> Correct order
            </Button>
          ) : null}

          {canMove ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                startBusy(async () => {
                  const result = await moveGarmentAction({
                    garmentId: stray.garmentId,
                    rackSlotId: "order",
                  });
                  if (result.ok) {
                    toast.success(
                      `${stray.garmentCode} moved back with its order`,
                    );
                    signalDataChange();
                    onResolved();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              <MapPin /> Move garment
            </Button>
          ) : null}

          <Button size="sm" variant="outline" asChild>
            <Link href={`/orders/${stray.actual.orderId}/tags`}>
              <Printer /> Print tag
            </Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/garments/${stray.garmentCode}`}>
              <ExternalLink /> View garment
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            disabled={disabled}
          >
            <ScanLine /> Scan again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
