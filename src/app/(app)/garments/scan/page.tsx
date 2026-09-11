import { PageHeader } from "@/components/shared/page-header";
import { ScanStation } from "@/app/(app)/garments/scan/scan-station";
import { PERMISSIONS } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Scan" };

export default async function ScanPage() {
  await requirePermission([PERMISSIONS.GARMENT_SCAN, PERMISSIONS.GARMENT_VIEW]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Garment lookup"
        description="Scan any tag to answer — where is this garment right now?"
      />
      <ScanStation />
    </div>
  );
}
