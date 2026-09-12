import { PageHeader } from "@/components/shared/page-header";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";
import { listScanHistory } from "@/lib/services/scanning";

import { ScanStation } from "./scan-station";

export const metadata = { title: "Scan tag" };

export default async function ScanPage() {
  const user = await requirePermission([PERMISSIONS.GARMENT_SCAN, PERMISSIONS.ORDER_VIEW]);

  const history = await listScanHistory({
    branchIds: hasPermission(user, PERMISSIONS.DASHBOARD_VIEW_ALL_BRANCHES)
      ? null
      : user.branchId
        ? [user.branchId]
        : [],
    limit: 60,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scan tag"
        description="Scan an order or garment tag to pull up the order, update it, take payment or reprint."
      />
      <ScanStation
        history={history}
        canUpdateStatus={hasPermission(user, PERMISSIONS.ORDER_UPDATE)}
        canTakePayment={hasPermission(user, PERMISSIONS.BILLING_RECORD_PAYMENT)}
      />
    </div>
  );
}
