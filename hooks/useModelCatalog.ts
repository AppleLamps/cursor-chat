"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FALLBACK_MODEL_CATALOG,
  normalizeModelCatalog,
  type ModelCatalogEntry
} from "@/lib/model-client";

export function useModelCatalog(apiKey: string | null) {
  const [models, setModels] = useState<ModelCatalogEntry[]>(FALLBACK_MODEL_CATALOG);
  const [loading, setLoading] = useState(false);
  const [usingFallback, setUsingFallback] = useState(true);
  const requestRef = useRef(0);

  const loadModels = useCallback(async () => {
    const request = ++requestRef.current;
    if (!apiKey) {
      setModels(FALLBACK_MODEL_CATALOG);
      setUsingFallback(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey })
      });
      if (request !== requestRef.current) return;
      if (!response.ok) throw new Error("Could not load models");
      const catalog = normalizeModelCatalog(await response.json());
      if (request !== requestRef.current) return;
      setModels(catalog.models);
      setUsingFallback(catalog.fallback);
    } catch {
      if (request !== requestRef.current) return;
      setModels(FALLBACK_MODEL_CATALOG);
      setUsingFallback(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  return { models, loading, usingFallback, reload: loadModels };
}
