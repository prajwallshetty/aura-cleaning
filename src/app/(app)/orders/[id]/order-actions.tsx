"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { humanize } from "@/lib/utils";
import {
  cancelOrderAction,
  rewashOrderAction,
  setOrderStatusAction,
} from "@/app/(app)/orders/actions";

interface OrderActionsProps {
  orderId: string;
  orderNumber: string;
  status: string;
  paidAmount: number;
  allowedStatuses: string[];
  canUpdate: boolean;
  canCancel: boolean;
  canRefund: boolean;
}

export function OrderActions({
  orderId,
  orderNumber,
  status,
  paidAmount,
  allowedStatuses,
  canUpdate,
  canCancel,
  canRefund,
}: OrderActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rewashOpen, setRewashOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundAmount, setRefundAmount] = useState(0);
  const [rewashReason, setRewashReason] = useState("");

  const changeStatus = (next: string) => {
    startTransition(async () => {
      const result = await setOrderStatusAction({ orderId, status: next });
      if (result.ok) {
        toast.success(`${orderNumber} moved to ${humanize(next)}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdate && allowedStatuses.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" loading={isPending}>
              Move status <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Currently {humanize(status)}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {allowedStatuses.map((next) => (
              <DropdownMenuItem key={next} onSelect={() => changeStatus(next)}>
                {humanize(next)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {canUpdate ? (
        <Dialog open={rewashOpen} onOpenChange={setRewashOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <RefreshCw /> Rewash
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send {orderNumber} for rewash</DialogTitle>
              <DialogDescription>
                Every garment on this order returns to the washing queue and any
                rack assignment is released.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Reason" required>
              <Textarea
                value={rewashReason}
                onChange={(event) => setRewashReason(event.target.value)}
                placeholder="Customer reported detergent smell…"
              />
            </FormField>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRewashOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await rewashOrderAction(orderId, rewashReason);
                    if (result.ok) {
                      toast.success(`${result.data.count} garments queued for rewash`);
                      setRewashOpen(false);
                      setRewashReason("");
                      router.refresh();
                    } else {
                      toast.error(result.error);
                    }
                  })
                }
              >
                Confirm rewash
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {canCancel ? (
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-destructive">
              <Ban /> Cancel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel {orderNumber}</DialogTitle>
              <DialogDescription>
                Processing stops immediately and open tasks are abandoned. This
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <FormField label="Reason" required>
                <Textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="Customer withdrew the order…"
                />
              </FormField>
              {canRefund && paidAmount > 0 ? (
                <FormField
                  label="Refund amount ₹"
                  hint={`Up to ₹${paidAmount.toFixed(2)} has been collected`}
                >
                  <Input
                    type="number"
                    min={0}
                    max={paidAmount}
                    step="0.01"
                    value={refundAmount}
                    onChange={(event) =>
                      setRefundAmount(Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </FormField>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                Keep order
              </Button>
              <Button
                variant="destructive"
                loading={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await cancelOrderAction({
                      orderId,
                      reason: cancelReason,
                      refundAmount,
                    });
                    if (result.ok) {
                      toast.success(`${orderNumber} cancelled`);
                      setCancelOpen(false);
                      router.refresh();
                    } else {
                      toast.error(result.error);
                    }
                  })
                }
              >
                Cancel order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
