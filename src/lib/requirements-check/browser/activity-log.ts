import type { ClickActivity } from "./click-navigator";
import type { ScrollProgress } from "./explore";
import { BROWSER_SCROLL_EVENT_MIN_MS } from "../constants";

type EmitFn = (type: string, message: string, payload?: Record<string, unknown>) => Promise<void>;
type SetCurrentFn = (page: string | null, action: string | null) => Promise<void>;

function truncateUrl(url: string, max = 72): string {
  if (url.length <= max) return url;
  try {
    const parsed = new URL(url);
    const tail = `${parsed.pathname}${parsed.search}`;
    if (tail.length <= max - parsed.hostname.length - 3) {
      return `${parsed.hostname}${tail}`;
    }
  } catch {
    // keep full url fallback
  }
  return `${url.slice(0, max - 1)}…`;
}

export function formatClickActivityMessage(activity: ClickActivity): string {
  switch (activity.type) {
    case "click":
      return `Clicked "${activity.label}" [${activity.targetKind}] on ${truncateUrl(activity.pageUrl)}`;
    case "menu_item":
      return `Menu item "${activity.itemLabel}" under "${activity.menuLabel}" on ${truncateUrl(activity.pageUrl)}`;
    case "navigated":
      return `Navigated via "${activity.label}": ${truncateUrl(activity.fromUrl)} → ${truncateUrl(activity.toUrl)}`;
    case "returned":
      return `Returned after "${activity.label}": ${truncateUrl(activity.fromUrl)} → ${truncateUrl(activity.toUrl)}`;
    case "discovered":
      return `Found URL via "${activity.via}": ${truncateUrl(activity.url)}`;
    default:
      return "Browser activity";
  }
}

export function createBrowserActivityHooks(input: {
  emit: EmitFn;
  setCurrent: SetCurrentFn;
}) {
  let lastScrollEventAt = 0;

  return {
    onNavigate: async (url: string) => {
      await input.setCurrent(url, "Opening page");
      await input.emit("page_opened", `Opened ${truncateUrl(url)}`, { url });
    },
    onScrollProgress: async (progress: ScrollProgress) => {
      const now = Date.now();
      const isFinalStep = progress.step >= progress.maxSteps;
      const shouldPersist =
        progress.step === 1 ||
        isFinalStep ||
        now - lastScrollEventAt >= BROWSER_SCROLL_EVENT_MIN_MS;

      if (!shouldPersist) return;

      lastScrollEventAt = now;
      await input.setCurrent(progress.url, `Scrolling (step ${progress.step})`);
      await input.emit(
        "page_scroll",
        `Scrolling ${truncateUrl(progress.url)} — step ${progress.step}/${progress.maxSteps}, height ${progress.scrollHeight}px`,
        progress,
      );
    },
    onClickActivity: async (activity: ClickActivity) => {
      const eventType =
        activity.type === "click"
          ? "button_clicked"
          : activity.type === "menu_item"
            ? "menu_item_clicked"
            : activity.type === "navigated"
              ? "page_navigated"
              : activity.type === "returned"
                ? "page_returned"
                : "url_discovered";
      await input.emit(eventType, formatClickActivityMessage(activity), activity);
    },
  };
}
