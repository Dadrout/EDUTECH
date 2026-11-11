"use client";

import { readLocal, writeLocal } from "@/lib/data/storage";

export const SIDEBAR_KEY = "bilimlens:sidebar-collapsed";
const CHANGE_EVENT = "bilimlens:sidebar-change";
let memoryValue: boolean | undefined;

export const getSidebarServerSnapshot = () => false;

export function getSidebarSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return memoryValue ?? readLocal(SIDEBAR_KEY, false, (value): value is boolean => typeof value === "boolean");
}

export function subscribeSidebar(notify: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const storageChanged = (event: StorageEvent) => {
    if (event.key === SIDEBAR_KEY || event.key === null) { memoryValue = undefined; notify(); }
  };
  window.addEventListener("storage", storageChanged);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  memoryValue = collapsed;
  writeLocal(SIDEBAR_KEY, collapsed);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
