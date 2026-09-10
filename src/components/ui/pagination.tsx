"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export const PAGE_SIZE = 8;

export function usePagedList<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages - 1);
  const slice = useMemo(
    () => items.slice(current * pageSize, current * pageSize + pageSize),
    [items, current, pageSize],
  );

  return {
    page: current,
    setPage,
    totalPages,
    slice,
    total: items.length,
    pageSize,
  };
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize = PAGE_SIZE,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-[var(--muted)]">
      <span>
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="ui-page-btn"
          disabled={page === 0}
          aria-label="Previous page"
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        {pageWindow(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="px-1">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className="ui-page-btn"
              data-active={item === page}
              onClick={() => onPage(item)}
            >
              {item + 1}
            </button>
          ),
        )}
        <button
          type="button"
          className="ui-page-btn"
          disabled={page >= totalPages - 1}
          aria-label="Next page"
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index);
  const items: Array<number | "gap"> = [0];
  const start = Math.max(1, page - 1);
  const end = Math.min(totalPages - 2, page + 1);
  if (start > 1) items.push("gap");
  for (let index = start; index <= end; index += 1) items.push(index);
  if (end < totalPages - 2) items.push("gap");
  items.push(totalPages - 1);
  return items;
}
