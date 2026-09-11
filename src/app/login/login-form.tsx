"use client";

import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/submit-button";
import { loginAction, type LoginState } from "@/app/login/actions";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "";
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      // A full refresh so the new session cookie is picked up by the server.
      router.replace(state.data.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {state && !state.ok ? <FormError message={state.error} /> : null}

      <FormField
        label="Email"
        htmlFor="email"
        required
        error={state && !state.ok ? state.fieldErrors?.email : undefined}
      >
        <div className="relative">
          <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@laundry.com"
            className="pl-8"
            required
          />
        </div>
      </FormField>

      <FormField
        label="Password"
        htmlFor="password"
        required
        error={state && !state.ok ? state.fieldErrors?.password : undefined}
      >
        <div className="relative">
          <Lock className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="pl-8"
            required
          />
        </div>
      </FormField>

      <SubmitButton className="w-full">Sign in</SubmitButton>
    </form>
  );
}
