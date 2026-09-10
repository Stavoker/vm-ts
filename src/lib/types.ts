export type SiteStatus =
  | "online"
  | "offline"
  | "payment_required"
  | "blocked"
  | "error";

export type Site = {
  id: string;
  name: string;
  url: string;
  status: SiteStatus;
  status_reason: string | null;
  http_status: number | null;
  response_time_ms: number | null;
  last_checked_at: string | null;
  last_online_at: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  ga4_property_id?: string | null;
  ga4_measurement_id?: string | null;
  ga4_enabled?: boolean;
};

export type SiteCheck = {
  id: string;
  site_id: string;
  status: SiteStatus;
  http_status: number | null;
  response_time_ms: number | null;
  status_reason: string | null;
  notified: boolean;
  created_at: string;
};

export type CheckResult = {
  status: SiteStatus;
  http_status: number | null;
  response_time_ms: number | null;
  status_reason: string | null;
};

export const STATUS_LABELS: Record<SiteStatus, string> = {
  online: "Работает",
  offline: "Недоступен",
  payment_required: "Требуется оплата",
  blocked: "Заблокирован",
  error: "Ошибка",
};
