"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/shared/form-field";
import { changePasswordAction } from "@/app/(app)/profile/actions";
import type { FieldErrors } from "@/lib/action-result";

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  return (
    <form
      className="max-w-sm space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          setFieldErrors({});
          const result = await changePasswordAction(form);
          if (result.ok) {
            toast.success("Password changed");
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
          } else {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
          }
        });
      }}
    >
      {error ? <FormError message={error} /> : null}

      <FormField label="Current password" required error={fieldErrors.currentPassword}>
        <Input
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
          required
        />
      </FormField>

      <FormField
        label="New password"
        required
        error={fieldErrors.newPassword}
        hint="At least 10 characters with upper case, lower case and a digit"
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
          required
        />
      </FormField>

      <FormField label="Confirm new password" required error={fieldErrors.confirmPassword}>
        <Input
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
          required
        />
      </FormField>

      <Button type="submit" loading={isPending}>
        Change password
      </Button>
    </form>
  );
}
