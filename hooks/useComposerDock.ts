"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Callback ref for the element that floats over the bottom of the message list.
 * Publishes its live height as `--composer-h` on its parent so the list can pad
 * itself by exactly that much, however tall the composer grows.
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
