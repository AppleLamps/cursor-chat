import { Cursor } from "@cursor/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearModelCatalogCacheForTests,
  getModelCatalog,
  normalizeModelSelection,
  validateSelectionAgainstCatalog
} from "@/lib/model-catalog";

vi.mock("@cursor/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cursor/sdk")>();
  return {
    ...actual,
    Cursor: { models: { list: vi.fn() } }
  };
});

const listModels = vi.mocked(Cursor.models.list);

describe("Cursor model catalog", () => {
  beforeEach(() => {
    clearModelCatalogCacheForTests();
    listModels.mockReset();
  });

  it("normalizes canonical selections and caches per credential", async () => {
    listModels.mockImplementation(async ({ apiKey } = {}) => [
      {
        id: `router-${apiKey}`,
        displayName: "Router",
        aliases: ["auto"],
        parameters: [
          {
            id: "mode",
            values: [{ value: "balance", displayName: "Balance" }]
          }
        ],
        variants: [
          {
            displayName: "Balanced",
            isDefault: true,
            params: [{ id: "mode", value: "balance" }]
          }
        ]
      }
    ]);

    const first = await getModelCatalog("key-a");
    const repeated = await getModelCatalog("key-a");
    const other = await getModelCatalog("key-b");

    expect(first.models[0]).toMatchObject({
      id: "router-key-a",
      aliases: ["auto"],
      model: {
        id: "router-key-a",
        params: [{ id: "mode", value: "balance" }]
      }
    });
    expect(repeated).toBe(first);
    expect(other.models[0]?.id).toBe("router-key-b");
    expect(listModels).toHaveBeenCalledTimes(2);
  });

  it("canonicalizes aliases and rejects unknown or invalid parameters", () => {
    const catalog = {
      fallback: false,
      models: [
        {
          id: "router",
          displayName: "Router",
          aliases: ["auto"],
          parameters: [
            {
              id: "mode",
              values: [{ value: "cost" }, { value: "intelligence" }]
            }
          ],
          variants: [],
          model: { id: "router" }
        }
      ]
    };

    expect(
      validateSelectionAgainstCatalog(
        { id: "auto", params: [{ id: "mode", value: "cost" }] },
        catalog
      )
    ).toEqual({
      ok: true,
      value: { id: "router", params: [{ id: "mode", value: "cost" }] }
    });
    expect(
      validateSelectionAgainstCatalog(
        { id: "auto", params: [{ id: "mode", value: "fastest" }] },
        catalog
      )
    ).toMatchObject({ ok: false });
    expect(
      validateSelectionAgainstCatalog({ id: "unknown" }, catalog)
    ).toMatchObject({ ok: false });
  });

  it("derives distinct variant labels and removes duplicate selections", async () => {
    listModels.mockResolvedValue([
      {
        id: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        parameters: [
          {
            id: "reasoning",
            displayName: "Reasoning",
            values: [
              { value: "low", displayName: "Low" },
              { value: "high", displayName: "High" }
            ]
          }
        ],
        variants: [
          {
            displayName: "GPT-5.6 Sol",
            params: [{ id: "reasoning", value: "low" }]
          },
          {
            displayName: "GPT-5.6 Sol",
            params: [{ id: "reasoning", value: "high" }]
          },
          {
            displayName: "GPT-5.6 Sol",
            isDefault: true,
            params: [{ id: "reasoning", value: "high" }]
          }
        ]
      }
    ]);

    const catalog = await getModelCatalog("key");

    expect(catalog.models[0]?.variants).toEqual([
      {
        displayName: "Low",
        params: [{ id: "reasoning", value: "low" }]
      },
      {
        displayName: "High (default)",
        isDefault: true,
        params: [{ id: "reasoning", value: "high" }]
      }
    ]);
  });

  it("rejects malformed selections rather than silently changing them", () => {
    expect(normalizeModelSelection({ id: "", params: [] })).toBeNull();
    expect(normalizeModelSelection({ id: "router", params: "cost" })).toBeNull();
  });
});
