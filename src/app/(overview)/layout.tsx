import type { ReactNode } from "react";

import { requireUser } from "@/lib/session";

/**
 * A deliberately chrome-free shell: the overview is a single self-contained
 * canvas, so it gets no sidebar and no topbar of its own.
 */
export default async function OverviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return children;
}
