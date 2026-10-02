"use client";

import { useEffect } from "react";

/**
 * iOS Safari does not resize the layout viewport when the keyboard opens; it
 * pans the visual viewport instead, which pushes fixed UI off screen. Mirror the
 * visual viewport into CSS variables so `.app-shell` always matches what is
 * actually visible.
 */
export function syncAppViewport(
  root: HTMLElement,
  viewport: Pick<VisualViewport, "height" | "offsetTop">
) {
  root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
  root.style.setProperty("--app-top", `${Math.max(0, Math.round(viewport.offsetTop))}px`);
}

export function useAppViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    const update = () => syncAppViewport(root, viewport);

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    };
  }, []);
}
