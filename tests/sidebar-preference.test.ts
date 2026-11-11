import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function browserStorage(blocked = false) {
  const values = new Map<string, string>();
  const target = new EventTarget();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => { if (blocked) throw new Error("Storage blocked"); return values.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (blocked) throw new Error("Storage blocked"); values.set(key, value); },
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  });
  return { values, target };
}

describe("desktop sidebar preference", () => {
  it("has a stable expanded server snapshot without browser storage", async () => {
    const state = await import("@/components/layout/sidebar-preference");
    expect(state.getSidebarServerSnapshot()).toBe(false);
    expect(state.getSidebarSnapshot()).toBe(false);
  });
  it("restores the saved preference on the client", async () => {
    const { values } = browserStorage();
    const state = await import("@/components/layout/sidebar-preference");
    values.set(state.SIDEBAR_KEY, "true");
    expect(state.getSidebarSnapshot()).toBe(true);
    expect(state.getSidebarServerSnapshot()).toBe(false);
  });
  it("persists toggles, notifies the UI and synchronizes another tab", async () => {
    const { values, target } = browserStorage();
    const state = await import("@/components/layout/sidebar-preference");
    const update = vi.fn();
    const unsubscribe = state.subscribeSidebar(update);
    state.setSidebarCollapsed(true);
    expect(values.get(state.SIDEBAR_KEY)).toBe("true");
    expect(state.getSidebarSnapshot()).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    values.set(state.SIDEBAR_KEY, "false");
    target.dispatchEvent(Object.assign(new Event("storage"), { key: state.SIDEBAR_KEY }));
    expect(state.getSidebarSnapshot()).toBe(false);
    expect(update).toHaveBeenCalledTimes(2);
    unsubscribe();
    state.setSidebarCollapsed(true);
    expect(update).toHaveBeenCalledTimes(2);
  });
  it("still toggles during the session when localStorage is unavailable", async () => {
    browserStorage(true);
    const state = await import("@/components/layout/sidebar-preference");
    expect(state.getSidebarSnapshot()).toBe(false);
    expect(() => state.setSidebarCollapsed(true)).not.toThrow();
    expect(state.getSidebarSnapshot()).toBe(true);
    state.setSidebarCollapsed(false);
    expect(state.getSidebarSnapshot()).toBe(false);
  });
});
