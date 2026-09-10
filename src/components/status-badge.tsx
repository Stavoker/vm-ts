import type { SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

const STYLES: Record<SiteStatus, string> = {
  online: "bg-[#e8f8ee] text-[#248a3d]",
  offline: "bg-[#f2f2f7] text-[#6e6e73]",
  payment_required: "bg-[#fff4e0] text-[#9a6700]",
  blocked: "bg-[#ffe9eb] text-[#d70015]",
  error: "bg-[#fff4e0] text-[#c93400]",
};

export function StatusBadge({ status }: { status: SiteStatus }) {
  return (
    <span className={`ui-chip ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
