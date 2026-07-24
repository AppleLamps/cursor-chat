"use client";

import { useCallback, useEffect, useRef } from "react";

export function useAgentRequestController() {
  const activeRequestRef = useRef<AbortController | null>(null);

  const beginRequest = useCallback(() => {
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    return controller;
  }, []);

  const clearRequest = useCallback((controller: AbortController) => {
    if (activeRequestRef.current === controller) {
      activeRequestRef.current = null;
    }
  }, []);

  const stopRequest = useCallback(() => {
    const controller = activeRequestRef.current;
    if (!controller) return false;
    controller.abort();
    return true;
  }, []);

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
    },
    []
  );

  return { beginRequest, clearRequest, stopRequest };
}
