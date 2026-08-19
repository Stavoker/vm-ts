export type ReminderKind = "phone" | "domain" | "service";
export type ReminderStatus = "pending" | "later" | "payed";

export type PaymentReminder = {
  id: string;
  notion_page_id: string;
  kind: ReminderKind;
  company: string;
  target: string | null;
  pay_for: string | null;
  due_date: string | null;
  status: ReminderStatus;
  last_notified_at: string | null;
  payed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotionPaymentItem = {
  pageId: string;
  kind: ReminderKind;
  company: string;
  target: string | null;
  payFor: string | null;
  dueDate: string | null;
};
