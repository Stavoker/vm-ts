import type { SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

const STYLES: Record<SiteStatus, string> = {
  online: "text-emerald-700",
  offline: "text-gray-500",
  payment_required: "text-amber-700",
  blocked: "text-red-700",
  error: "text-orange-700",
};

export function StatusBadge({ status }: { status: SiteStatus }) {
  return (
    <span className={`text-sm font-medium ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
