"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Measures the in-flow composer dock for the floating undo notification.
 * Transcript height is allocated by flexbox, so it never needs a matching
 * padding reservation or depends on this measurement to avoid being covered.
 */
export function useComposerDock() {
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return useCallback((element: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    const target = element?.parentElement;
    if (!element || !target || typeof ResizeObserver === "undefined") return;

    const publish = () =>
      target.style.setProperty("--composer-h", `${Math.ceil(element.offsetHeight)}px`);

    publish();
    observerRef.current = new ResizeObserver(publish);
    observerRef.current.observe(element);
  }, []);
}
