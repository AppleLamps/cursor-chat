import { createHash } from "node:crypto";
import { Cursor } from "@cursor/sdk";
import type {
  ModelListItem,
  ModelParameterDefinition,
  ModelParameterValue,
  ModelSelection,
  ModelVariant
} from "@cursor/sdk";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "@/lib/defaults";

export type CatalogModel = {
  id: string;
  displayName: string;
  description?: string;
  aliases: string[];
  parameters: ModelParameterDefinition[];
  variants: ModelVariant[];
  model: ModelSelection;
};

export type ModelCatalog = {
  models: CatalogModel[];
  fallback: boolean;
};

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const catalogCache = new Map<
  string,
  { expiresAt: number; value: ModelCatalog }
>();

function normalizeParams(value: unknown): ModelParameterValue[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const params = value
    .filter(
      (item): item is ModelParameterValue =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ModelParameterValue).id === "string" &&
        typeof (item as ModelParameterValue).value === "string"
    )
    .map((item) => ({ id: item.id.trim(), value: item.value.trim() }))
    .filter((item) => item.id && item.value);

  return params.length > 0 ? params : undefined;
}

function normalizeCatalogModel(item: ModelListItem): CatalogModel | null {
  const id = item.id?.trim();
  if (!id) return null;

  const parameters = Array.isArray(item.parameters)
    ? item.parameters
        .filter(
          (parameter) =>
            Boolean(parameter?.id?.trim()) &&
            Array.isArray(parameter.values) &&
            parameter.values.length > 0
        )
        .map((parameter) => ({
          id: parameter.id.trim(),
          ...(parameter.displayName?.trim()
            ? { displayName: parameter.displayName.trim() }
            : {}),
          values: parameter.values
            .filter((value) => Boolean(value?.value?.trim()))
            .map((value) => ({
              value: value.value.trim(),
              ...(value.displayName?.trim()
                ? { displayName: value.displayName.trim() }
                : {})
            }))
        }))
        .filter((parameter) => parameter.values.length > 0)
    : [];
  const variants = Array.isArray(item.variants)
    ? item.variants
        .map((variant) => ({
          ...variant,
          params: normalizeParams(variant.params) ?? []
        }))
        .filter((variant) => variant.params.length > 0)
    : [];
  const defaultParams = variants.find((variant) => variant.isDefault)?.params;

  return {
    id,
    displayName: item.displayName?.trim() || id,
    ...(item.description?.trim()
      ? { description: item.description.trim() }
      : {}),
    aliases: Array.isArray(item.aliases)
      ? [...new Set(item.aliases.map((alias) => alias.trim()).filter(Boolean))]
      : [],
    parameters,
    variants,
    model: {
      id,
      ...(defaultParams?.length ? { params: defaultParams } : {})
    }
  };
}

function fallbackCatalog(): ModelCatalog {
  return {
    fallback: true,
    models: AVAILABLE_MODELS.map((model) => ({
      id: model.id,
      displayName: model.label,
      description: model.description,
      aliases: [],
      parameters: [],
      variants: [],
      model: { id: model.id }
    }))
  };
}

function cacheKey(apiKey: string) {
  return createHash("sha256").update(apiKey.trim()).digest("base64url");
}

function putCache(key: string, value: ModelCatalog) {
  const now = Date.now();
  for (const [candidate, entry] of catalogCache) {
    if (entry.expiresAt <= now) catalogCache.delete(candidate);
  }
  while (catalogCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = catalogCache.keys().next().value;
    if (!oldest) break;
    catalogCache.delete(oldest);
  }
  catalogCache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
}

export async function getModelCatalog(apiKey: string): Promise<ModelCatalog> {
  const key = cacheKey(apiKey);
  const cached = catalogCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) catalogCache.delete(key);

  const models = (await Cursor.models.list({ apiKey }))
    .map(normalizeCatalogModel)
    .filter((model): model is CatalogModel => model !== null);
  const value = models.length > 0 ? { models, fallback: false } : fallbackCatalog();
  putCache(key, value);
  return value;
}

export function getFallbackModelCatalog() {
  return fallbackCatalog();
}

export function normalizeModelSelection(
  value: unknown,
  legacyModelId?: unknown
): ModelSelection | null {
  if (value !== undefined) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const id = (value as ModelSelection).id;
    if (typeof id !== "string" || !id.trim()) return null;
    const rawParams = (value as ModelSelection).params;
    const params = normalizeParams(rawParams);
    if (
      rawParams !== undefined &&
      (!Array.isArray(rawParams) ||
        (rawParams.length > 0 && params?.length !== rawParams.length))
    ) {
      return null;
    }
    return { id: id.trim(), ...(params ? { params } : {}) };
  }

  const id =
    typeof legacyModelId === "string" && legacyModelId.trim()
      ? legacyModelId.trim()
      : DEFAULT_MODEL_ID;
  return { id };
}

export function validateSelectionAgainstCatalog(
  selection: ModelSelection,
  catalog: ModelCatalog
): { ok: true; value: ModelSelection } | { ok: false; error: string } {
  const matches = catalog.models.filter(
    (model) => model.id === selection.id || model.aliases.includes(selection.id)
  );
  if (matches.length > 1) {
    return { ok: false, error: "The selected Cursor model alias is ambiguous." };
  }
  const item = matches[0];
  if (!item) {
    return { ok: false, error: "The selected Cursor model is not available." };
  }

  const id = item.id;
  const params = selection.params ?? item.model.params;
  if (!params?.length) return { ok: true, value: { id } };

  const seen = new Set<string>();
  for (const param of params) {
    if (seen.has(param.id)) {
      return { ok: false, error: `Duplicate model parameter: ${param.id}.` };
    }
    seen.add(param.id);
    const definition = item.parameters.find((candidate) => candidate.id === param.id);
    if (
      !definition ||
      !definition.values.some((candidate) => candidate.value === param.value)
    ) {
      return {
        ok: false,
        error: `Unsupported value for model parameter ${param.id}.`
      };
    }
  }

  return {
    ok: true,
    value: { id, params: [...params].sort((a, b) => a.id.localeCompare(b.id)) }
  };
}

export function modelSelectionKey(selection: ModelSelection) {
  const params = [...(selection.params ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  return JSON.stringify({ id: selection.id, ...(params.length ? { params } : {}) });
}

export function clearModelCatalogCacheForTests() {
  catalogCache.clear();
}
