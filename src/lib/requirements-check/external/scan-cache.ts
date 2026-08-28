import type { ScanContext } from "../types";

export async function getScanExternal<T>(
  context: ScanContext,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  if (!context.externalCache) {
    context.externalCache = new Map();
  }
  if (context.externalCache.has(key)) {
    return context.externalCache.get(key) as T;
  }
  const value = await loader();
  context.externalCache.set(key, value);
  return value;
}
