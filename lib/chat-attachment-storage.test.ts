import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/lib/chat-types";
import {
  hydrateConversationsFromStorage,
  imageStorageKey,
  serializeConversationsForStorage
} from "@/lib/chat-attachment-storage";
import { createConversation } from "@/lib/chat-conversation";

const imageStore = new Map<string, string>();

function requestWithResult<T>(result: T) {
  const request = { result, onsuccess: null as null | (() => void), onerror: null };
  queueMicrotask(() => request.onsuccess?.());
  return request;
}

function transaction() {
  const tx = {
    oncomplete: null as null | (() => void),
    onerror: null,
    objectStore: () => ({
      put: (value: string, key: string) => {
        imageStore.set(key, value);
        queueMicrotask(() => tx.oncomplete?.());
      },
      get: (key: string) => requestWithResult(imageStore.get(key)),
      getAllKeys: () => requestWithResult([...imageStore.keys()]),
      delete: (key: string) => {
        imageStore.delete(key);
      }
    })
  };
  return tx;
}

beforeEach(() => {
  imageStore.clear();
  const db = {
    createObjectStore: vi.fn(),
    transaction
  };
  const indexedDB = {
    open: vi.fn(() => {
      const request = {
        result: db,
        onupgradeneeded: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    })
  };
  vi.stubGlobal("window", { indexedDB });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat attachment storage", () => {
  it("uses stable image storage keys", () => {
    expect(
      imageStorageKey({
        id: "image",
        name: "screen.png",
        mimeType: "image/png",
        url: "data:image/png;base64,abc"
      })
    ).toBe("image:image");
  });

  it("serializes data-url images out of localStorage and hydrates them back", async () => {
    const conversation: Conversation = {
      ...createConversation(),
      id: "chat",
      messages: [
        {
          id: "message",
          role: "user",
          content: "image",
          createdAt: "2026-06-26T12:00:00.000Z",
          imageAttachments: [
            {
              id: "image",
              name: "screen.png",
              mimeType: "image/png",
              url: "data:image/png;base64,abc"
            }
          ]
        }
      ]
    };

    const serialized = await serializeConversationsForStorage([conversation]);
    expect(serialized.conversations[0].messages[0].imageAttachments?.[0].url).toBe("");

    const hydrated = await hydrateConversationsFromStorage(
      serialized.conversations
    );
    expect(hydrated[0].messages[0].imageAttachments?.[0].url).toBe(
      "data:image/png;base64,abc"
    );
  });
});
