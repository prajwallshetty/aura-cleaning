import { Suspense } from "react";
import { Shirt } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "@/app/login/login-form";

export const metadata = { title: "Enter access code" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Shirt className="size-7" aria-hidden />
          </span>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Laundry Management</h1>
            <p className="text-sm text-muted-foreground">Enter your access code</p>
          </div>
        </div>

        <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-muted-foreground">
          Lost your code? Ask a Super Admin to look it up in Staff.
        </p>
      </div>
    </div>
  );
}
