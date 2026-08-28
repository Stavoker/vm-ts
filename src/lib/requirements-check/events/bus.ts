import { EventEmitter } from "node:events";
import type { ScanEvent } from "../types";

const buses = new Map<string, EventEmitter>();

function getBus(sessionId: string): EventEmitter {
  let bus = buses.get(sessionId);
  if (!bus) {
    bus = new EventEmitter();
    bus.setMaxListeners(50);
    buses.set(sessionId, bus);
  }
  return bus;
}

export function publishScanEvent(event: ScanEvent): void {
  getBus(event.session_id).emit("event", event);
}

export function publishScreenshot(sessionId: string, dataUrl: string): void {
  getBus(sessionId).emit("screenshot", { sessionId, dataUrl, createdAt: new Date().toISOString() });
}

export function subscribeScanEvents(
  sessionId: string,
  onEvent: (event: ScanEvent) => void,
  onScreenshot?: (payload: { dataUrl: string; createdAt: string }) => void,
): () => void {
  const bus = getBus(sessionId);
  bus.on("event", onEvent);
  if (onScreenshot) bus.on("screenshot", onScreenshot);
  return () => {
    bus.off("event", onEvent);
    if (onScreenshot) bus.off("screenshot", onScreenshot);
  };
}

export function disposeScanBus(sessionId: string): void {
  buses.delete(sessionId);
}
