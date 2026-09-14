import { PageHeader } from "@/components/shared/page-header";
import { PERMISSIONS } from "@/lib/rbac";
import { hasPermission, requirePermission } from "@/lib/session";
import { listScanHistory } from "@/lib/services/scanning";

import { ScanStation } from "./scan-station";

export const metadata = { title: "Scan" };

export default async function ScanPage() {
  const user = await requirePermission(PERMISSIONS.GARMENT_SCAN);

  const history = await listScanHistory({
    branchIds: hasPermission(user, PERMISSIONS.DASHBOARD_VIEW_ALL_BRANCHES)
      ? null
      : user.branchId
        ? [user.branchId]
        : [],
    limit: 40,
  });

  const canUpdateStatus = hasPermission(user, [
    PERMISSIONS.PROCESSING_SORTING,
    PERMISSIONS.PROCESSING_WASHING,
    PERMISSIONS.PROCESSING_DRYING,
    PERMISSIONS.PROCESSING_IRONING,
    PERMISSIONS.PROCESSING_QC,
    PERMISSIONS.PROCESSING_PACKING,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scan"
        description="Scan a garment tag to instantly identify it, confirm the owner, update its status and move on to the next one."
      />
      <ScanStation
        history={history}
        canUpdateStatus={canUpdateStatus}
        canResolve={hasPermission(user, PERMISSIONS.TRACKING_RESOLVE)}
      />
    </div>
  );
}
