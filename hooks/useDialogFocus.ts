"use client";

import { type RefObject, useEffect, useRef } from "react";

const TABBABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last. Only the top one reacts to Escape and Tab. */
const openDialogs: symbol[] = [];

function tabbableWithin(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0
  );
}

/**
 * Modal behavior for a hand-rolled dialog: focus moves in when it opens, Tab
 * stays inside it, Escape closes it, and focus returns to whatever opened it.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  { active, onClose }: { active: boolean; onClose?: () => void }
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    const id = Symbol("dialog");
    const opener = document.activeElement as HTMLElement | null;
    openDialogs.push(id);

    if (!container.contains(document.activeElement)) {
      const preferred = container.querySelector<HTMLElement>("[data-autofocus]");
      const target = preferred ?? tabbableWithin(container)[0] ?? container;
      if (target === container && !container.hasAttribute("tabindex")) {
        container.tabIndex = -1;
      }
      target.focus({ preventScroll: true });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== id) return;

      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !container) return;

      const items = tabbableWithin(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (!container.contains(current)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const index = openDialogs.indexOf(id);
      if (index >= 0) openDialogs.splice(index, 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, containerRef]);
}
