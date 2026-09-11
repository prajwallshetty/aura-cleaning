"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Grid3x3, Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/shared/form-field";
import { generateSlotsAction, saveRackAction } from "@/app/(app)/racks/actions";

export function NewRackDialog({
  branches,
  defaultBranchId,
}: {
  branches: { value: string; label: string }[];
  defaultBranchId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.value ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slotCount, setSlotCount] = useState(20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New rack
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a rack</DialogTitle>
          <DialogDescription>
            Racks hold the numbered slots that finished orders are filed into.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {branches.length > 1 ? (
            <FormField label="Branch" required className="sm:col-span-2">
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.value} value={branch.value}>
                      {branch.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}

          <FormField label="Rack code" required hint="Single letter works best, e.g. A">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="A"
              maxLength={8}
            />
          </FormField>

          <FormField label="Name" required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ready for collection"
            />
          </FormField>

          <FormField label="Slots to generate" hint="Creates A01, A02, …">
            <Input
              type="number"
              min={0}
              max={200}
              value={slotCount}
              onChange={(event) => setSlotCount(Number(event.target.value) || 0)}
            />
          </FormField>

          <FormField label="Description" className="sm:col-span-2">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Near the front counter"
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveRackAction({
                  branchId,
                  code,
                  name,
                  description,
                  isActive: true,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                if (slotCount > 0) {
                  const slots = await generateSlotsAction({
                    rackId: result.data.id,
                    count: slotCount,
                    startAt: 1,
                    capacity: 20,
                  });
                  if (!slots.ok) toast.error(slots.error);
                }
                toast.success(`Rack ${code} created`);
                setOpen(false);
                setCode("");
                setName("");
                setDescription("");
                router.refresh();
              })
            }
          >
            Create rack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GenerateSlotsDialog({
  rackId,
  rackCode,
  startAt,
}: {
  rackId: string;
  rackCode: string;
  startAt: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [count, setCount] = useState(10);
  const [capacity, setCapacity] = useState(20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Grid3x3 /> Add slots
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add slots to rack {rackCode}</DialogTitle>
          <DialogDescription>
            Slots are numbered from {rackCode}
            {String(startAt).padStart(2, "0")} onwards.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="How many">
            <Input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => setCount(Number(event.target.value) || 1)}
            />
          </FormField>
          <FormField label="Garments per slot">
            <Input
              type="number"
              min={1}
              max={500}
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value) || 1)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await generateSlotsAction({
                  rackId,
                  count,
                  startAt,
                  capacity,
                });
                if (result.ok) {
                  toast.success(`${result.data.created} slots added`);
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            Add slots
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
