import { getOverviewData } from "@/lib/services/overview";
import { requireUser } from "@/lib/session";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission } from "@/lib/session";
import { OverviewDashboard } from "@/app/(overview)/overview/overview-dashboard";
import { LiveRefresh } from "@/components/shared/live-refresh";

export const metadata = {
  title: "Overview",
  description: "Your laundry business at a glance.",
};

export default async function OverviewPage() {
  const user = await requireUser();
  const data = await getOverviewData(user);

  return (
    <>
      <LiveRefresh intervalMs={20000} />
      <OverviewDashboard
        data={data}
        canSeeRevenue={hasPermission(user, [
          PERMISSIONS.DASHBOARD_VIEW_FINANCIALS,
          PERMISSIONS.BILLING_VIEW,
        ])}
      />
    </>
  );
}
