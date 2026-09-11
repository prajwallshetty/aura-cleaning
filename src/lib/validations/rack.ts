import { z } from "zod";

import { cuidSchema, optionalText } from "@/lib/validations/common";

export const rackSchema = z.object({
  id: z.string().optional(),
  branchId: cuidSchema,
  code: z
    .string()
    .trim()
    .min(1, "Rack code is required")
    .max(8)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, digits or hyphens only")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, "Give the rack a name").max(80),
  description: optionalText(300),
  isActive: z.boolean().default(true),
});

export const slotSchema = z.object({
  id: z.string().optional(),
  rackId: cuidSchema,
  code: z
    .string()
    .trim()
    .min(1, "Slot code is required")
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, digits or hyphens only")
    .transform((value) => value.toUpperCase()),
  label: optionalText(80),
  capacity: z.coerce.number().int().min(1).max(500).default(20),
  isActive: z.boolean().default(true),
});

/** Bulk-creates A01…A20 style slots in one go. */
export const generateSlotsSchema = z.object({
  rackId: cuidSchema,
  count: z.coerce.number().int().min(1).max(200),
  startAt: z.coerce.number().int().min(1).max(999).default(1),
  capacity: z.coerce.number().int().min(1).max(500).default(20),
});

export const releaseSlotSchema = z.object({
  garmentIds: z.array(cuidSchema).min(1),
  note: optionalText(300),
});
