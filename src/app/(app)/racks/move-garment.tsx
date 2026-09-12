"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoveRight } from "lucide-react";
import { toast } from "sonner";

import { signalDataChange } from "@/components/shared/live-refresh";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/shared/form-field";
import { assignSlotAction } from "@/app/(app)/garments/actions";

export interface SlotOption {
  id: string;
  label: string;
  free: number;
}

/**
 * Moves one garment to another slot, anywhere in the branch. The action files
 * it through the same path the packing station uses, so its location history,
 * the order's rack and every screen showing a location update together.
 */
export function MoveGarmentDialog({
  garmentId,
  garmentCode,
  currentSlotLabel,
  slots,
}: {
  garmentId: string;
  garmentCode: string;
  currentSlotLabel: string;
  slots: SlotOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [pending, startTransition] = useTransition();

  const available = slots.filter((slot) => slot.free > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTarget("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MoveRight /> Move
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {garmentCode}</DialogTitle>
          <DialogDescription>
            Currently on {currentSlotLabel}. Pick where it is going; the move is
            written to the garment&apos;s location history.
          </DialogDescription>
        </DialogHeader>

        <FormField label="Destination slot" required>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a slot with room…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((slot) => (
                <SelectItem key={slot.id} value={slot.id}>
                  {slot.label} · {slot.free} free
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {available.length === 0 ? (
          <p className="text-sm text-destructive">
            Every slot in this branch is full. Free one up first.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !target}
            onClick={() =>
              startTransition(async () => {
                const result = await assignSlotAction({
                  rackSlotId: target,
                  garmentIds: [garmentId],
                  note: "Moved from rack management",
                });
                if (result.ok) {
                  toast.success(`${garmentCode} moved`);
                  setOpen(false);
                  signalDataChange();
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            <MoveRight /> Move garment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
