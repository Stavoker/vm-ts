export type RequirementCheckType =
  | "AUTOMATED"
  | "AUTHENTICATED"
  | "AI_REVIEW"
  | "EXTERNAL_DATA"
  | "HYBRID"
  | "MANUAL_ONLY";

export type RequirementResultStatus = "PASS" | "MANUAL" | "FAIL";

export type ScanStatus =
  | "pending"
  | "discovering"
  | "running"
  | "paused_for_user"
  | "generating_report"
  | "completed"
  | "failed"
  | "cancelled";

export type PageType =
  | "homepage"
  | "category"
  | "product"
  | "static"
  | "legal"
  | "login"
  | "registration"
  | "account"
  | "cart"
  | "checkout"
  | "contact"
  | "support"
  | "unknown";

export type RequirementDefinition = {
  id: string;
  originalName: string;
  displayName: string;
  originalDescription: string;
  category: string;
  subCategory: string;
  type: RequirementCheckType;
  weight: number;
  severity: "low" | "medium" | "high";
  enabled: boolean;
  order: number;
  automationHandler: string;
  manualInstructions: string;
  evidenceRequirements: string[];
  sourceReference: string;
  sourceSection: string;
  originalOrder: number;
  mandatoryLevel: string;
};

export type RequirementEvidence = {
  url?: string | null;
  screenshotPath?: string | null;
  textSnippet?: string | null;
  httpStatus?: number | null;
  headers?: Record<string, string> | null;
  selector?: string | null;
  timestamp?: string | null;
  networkEvent?: string | null;
  calculatedValue?: string | null;
  externalData?: Record<string, unknown> | null;
  manualInstruction?: string | null;
  confidence?: number | null;
  metrics?: Record<string, unknown> | null;
};

export type RequirementCheckResult = {
  requirementId: string;
  status: RequirementResultStatus;
  explanation: string;
  checkedUrl?: string | null;
  evidence?: RequirementEvidence | null;
  confidence?: number | null;
  handlerUsed?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type DiscoveredPage = {
  url: string;
  pageType: PageType;
  httpStatus?: number | null;
  title?: string | null;
  checked: boolean;
};

export type ScanCredentials = {
  login?: string;
  password?: string;
  loginPageUrl?: string;
};

export type RequirementCheckSession = {
  id: string;
  website_url: string;
  hostname: string;
  status: ScanStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  overall_score: number | null;
  automation_coverage: number | null;
  total_requirements: number;
  passed_requirements: number;
  manual_requirements: number;
  failed_requirements: number;
  discovered_pages: number;
  checked_pages: number;
  current_page: string | null;
  current_action: string | null;
  duration_ms: number | null;
  error_message: string | null;
  login_page_url: string | null;
  has_credentials: boolean;
  progress_percent: number;
  latest_screenshot_path: string | null;
  pause_reason: string | null;
};

export type RequirementResultRow = RequirementCheckResult & {
  id: string;
  session_id: string;
  requirement_id: string;
  requirement_name: string;
  requirement_category: string;
  requirement_sub_category: string;
  requirement_type: RequirementCheckType;
  weight: number;
  created_at: string;
  checked_url?: string | null;
  handler_used?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type ScanEvent = {
  id?: string;
  session_id: string;
  event_type: string;
  message: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

export type ScanContext = {
  sessionId: string;
  websiteUrl: string;
  hostname: string;
  credentials?: ScanCredentials;
  pages: DiscoveredPage[];
  results: Map<string, RequirementCheckResult>;
  emit: (type: string, message: string, payload?: Record<string, unknown>) => Promise<void>;
  setCurrent: (page: string | null, action: string | null) => Promise<void>;
  saveScreenshot: (label: string, buffer: Buffer) => Promise<string | null>;
  isCancelled: () => boolean;
  isPaused: () => boolean;
  waitIfPaused: () => Promise<void>;
};

export type RequirementHandler = (
  definition: RequirementDefinition,
  context: ScanContext,
) => RequirementCheckResult | Promise<RequirementCheckResult>;

export type CoverageReport = {
  total: number;
  mapped: number;
  automated: number;
  authenticated: number;
  aiReview: number;
  externalData: number;
  hybrid: number;
  manualOnly: number;
  unmapped: number;
};
