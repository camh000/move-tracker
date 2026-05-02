"use client";

import * as React from "react";

const KEY = "movetracker.active_box";
const TTL_MS = 24 * 60 * 60 * 1000;

interface ActiveBoxState {
  id: string;
  setAt: number;
}

function read(): ActiveBoxState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveBoxState;
    if (!parsed?.id || !parsed.setAt) return null;
    if (Date.now() - parsed.setAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(value: ActiveBoxState | null) {
  if (typeof window === "undefined") return;
  if (value == null) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("active-box-changed"));
}

export function useActiveBox() {
  const [state, setState] = React.useState<ActiveBoxState | null>(null);

  React.useEffect(() => {
    setState(read());
    const onChange = () => setState(read());
    window.addEventListener("active-box-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("active-box-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setActiveBox = React.useCallback((id: string | null) => {
    if (!id) write(null);
    else write({ id, setAt: Date.now() });
  }, []);

  return {
    activeBoxId: state?.id ?? null,
    setActiveBox,
  };
}
