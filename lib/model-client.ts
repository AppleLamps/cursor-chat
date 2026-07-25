import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "@/lib/defaults";

export type ModelSelection = {
  id: string;
  params?: Array<{ id: string; value: string }>;
};
export type ModelCatalogEntry = {
  id: string;
  displayName: string;
  description?: string;
  aliases: string[];
  parameters: Array<{
    id: string;
    displayName?: string;
    values: Array<{ value: string; displayName?: string }>;
  }>;
  variants: Array<{
    params: Array<{ id: string; value: string }>;
    displayName: string;
    description?: string;
    isDefault?: boolean;
  }>;
  model: ModelSelection;
};

export const FALLBACK_MODEL_CATALOG: ModelCatalogEntry[] = AVAILABLE_MODELS.map(
  (entry) => ({
    id: entry.id, displayName: entry.label, description: entry.description,
    aliases: [], parameters: [], variants: [], model: { id: entry.id }
  })
);
export const DEFAULT_MODEL_SELECTION: ModelSelection = { id: DEFAULT_MODEL_ID };

export function normalizeModelSelection(value: unknown, legacyId?: unknown): ModelSelection {
  if (typeof value === "string") return { id: value.trim() || DEFAULT_MODEL_ID };
  if (!value || typeof value !== "object") {
    return { id: typeof legacyId === "string" && legacyId.trim() ? legacyId.trim() : DEFAULT_MODEL_ID };
  }
  const candidate = value as ModelSelection;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const params = Array.isArray(candidate.params)
    ? candidate.params.filter((param) =>
        param && typeof param.id === "string" && typeof param.value === "string" &&
        Boolean(param.id.trim()) && Boolean(param.value.trim()))
    : undefined;
  return { id: id || DEFAULT_MODEL_ID, ...(params?.length ? { params } : {}) };
}

export function normalizeModelCatalog(value: unknown) {
  const payload = value && typeof value === "object"
    ? value as { models?: unknown; fallback?: unknown }
    : {};
  return Array.isArray(payload.models) && payload.models.length
    ? { models: payload.models as ModelCatalogEntry[], fallback: payload.fallback === true }
    : { models: FALLBACK_MODEL_CATALOG, fallback: true };
}

export function modelSelectionsEqual(a: ModelSelection, b: ModelSelection) {
  const key = (selection: ModelSelection) => JSON.stringify({
    id: selection.id,
    params: [...(selection.params ?? [])].sort((x, y) => x.id.localeCompare(y.id))
  });
  return key(a) === key(b);
}
