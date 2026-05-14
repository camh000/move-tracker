import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useActiveBox } from "./use-active-box";

const KEY = "movetracker.active_box";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useActiveBox", () => {
  it("starts with null when nothing is stored", () => {
    const { result } = renderHook(() => useActiveBox());
    expect(result.current.activeBoxId).toBeNull();
  });

  it("hydrates from localStorage on mount", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: "box-42", setAt: Date.now() }));
    const { result } = renderHook(() => useActiveBox());
    expect(result.current.activeBoxId).toBe("box-42");
  });

  it("setActiveBox persists and triggers an active-box-changed event", () => {
    const listener = vi.fn();
    window.addEventListener("active-box-changed", listener);

    const { result } = renderHook(() => useActiveBox());
    act(() => result.current.setActiveBox("box-7"));

    expect(result.current.activeBoxId).toBe("box-7");
    expect(listener).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(stored.id).toBe("box-7");

    window.removeEventListener("active-box-changed", listener);
  });

  it("setActiveBox(null) clears the entry", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: "old", setAt: Date.now() }));
    const { result } = renderHook(() => useActiveBox());
    expect(result.current.activeBoxId).toBe("old");

    act(() => result.current.setActiveBox(null));
    expect(result.current.activeBoxId).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("ignores stale entries past the TTL", () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(KEY, JSON.stringify({ id: "stale", setAt: twoDaysAgo }));
    const { result } = renderHook(() => useActiveBox());
    expect(result.current.activeBoxId).toBeNull();
  });

  it("ignores malformed JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useActiveBox());
    expect(result.current.activeBoxId).toBeNull();
  });
});
