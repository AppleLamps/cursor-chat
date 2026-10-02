import type { Conversation, ImageAttachment } from "@/lib/chat-types";

const ATTACHMENT_DB_NAME = "codebase-chat-attachments-v1";
const ATTACHMENT_DB_STORE = "image-data-urls";

let attachmentDbPromise: Promise<IDBDatabase> | null = null;

/**
 * Keys known to be in IndexedDB already. State keeps the data: URL after a
 * reload, so without this every save would rewrite every image.
 */
const persistedImageKeys = new Set<string>();

function openAttachmentDb() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  attachmentDbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(ATTACHMENT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(ATTACHMENT_DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Could not open attachment storage."));
  });

  return attachmentDbPromise;
}

async function writeStoredImage(key: string, dataUrl: string) {
  const db = await openAttachmentDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_DB_STORE, "readwrite");
    const store = transaction.objectStore(ATTACHMENT_DB_STORE);
    store.put(dataUrl, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("Could not save image attachment."));
  });
}

async function readStoredImage(key: string) {
  const db = await openAttachmentDb();

  return new Promise<string | null>((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_DB_STORE, "readonly");
    const request = transaction.objectStore(ATTACHMENT_DB_STORE).get(key);
    request.onsuccess = () =>
      resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () =>
      reject(request.error || new Error("Could not load image attachment."));
  });
}

export async function pruneStoredImages(activeKeys: Set<string>) {
  const db = await openAttachmentDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_DB_STORE, "readwrite");
    const store = transaction.objectStore(ATTACHMENT_DB_STORE);
    const request = store.getAllKeys();

    request.onsuccess = () => {
      for (const key of request.result) {
        if (typeof key === "string" && !activeKeys.has(key)) {
          store.delete(key);
        }
      }
      for (const key of [...persistedImageKeys]) {
        if (!activeKeys.has(key)) persistedImageKeys.delete(key);
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("Could not clean image storage."));
  });
}

export function imageStorageKey(image: ImageAttachment) {
  return image.storageKey || `image:${image.id}`;
}

type PendingImageWrite = { key: string; dataUrl: string };

/**
 * Replaces inline image data with a storage key. Synchronous so it can also run
 * while the page is closing; the returned writes still need to reach IndexedDB.
 */
export function serializeConversationsSync(conversations: Conversation[]) {
  const activeImageKeys = new Set<string>();
  const pendingWrites: PendingImageWrite[] = [];

  const serialized = conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) => ({
      ...message,
      imageAttachments: message.imageAttachments?.map((image) => {
        if (!image.url.startsWith("data:")) {
          if (image.storageKey) activeImageKeys.add(image.storageKey);
          return image;
        }

        const storageKey = imageStorageKey(image);
        activeImageKeys.add(storageKey);
        if (!persistedImageKeys.has(storageKey)) {
          pendingWrites.push({ key: storageKey, dataUrl: image.url });
        }

        return {
          ...image,
          storageKey,
          url: ""
        };
      })
    }))
  }));

  return { conversations: serialized, activeImageKeys, pendingWrites };
}

export async function writePendingImages(writes: PendingImageWrite[]) {
  await Promise.all(
    writes.map(async ({ key, dataUrl }) => {
      try {
        await writeStoredImage(key, dataUrl);
        persistedImageKeys.add(key);
      } catch {
        // The chat text is still saved; the image just won't survive a reload.
      }
    })
  );
}

export async function serializeConversationsForStorage(
  conversations: Conversation[]
) {
  const { pendingWrites, ...rest } = serializeConversationsSync(conversations);
  await writePendingImages(pendingWrites);
  return rest;
}

export async function hydrateConversationsFromStorage(
  conversations: Conversation[]
) {
  return Promise.all(
    conversations.map(async (conversation) => ({
      ...conversation,
      messages: await Promise.all(
        conversation.messages.map(async (message) => ({
          ...message,
          imageAttachments: message.imageAttachments
            ? await Promise.all(
                message.imageAttachments.map(async (image) => {
                  if (!image.storageKey || image.url.startsWith("data:")) {
                    return image;
                  }

                  try {
                    const storedUrl = await readStoredImage(image.storageKey);
                    if (storedUrl) persistedImageKeys.add(image.storageKey);
                    return storedUrl ? { ...image, url: storedUrl } : image;
                  } catch {
                    return image;
                  }
                })
              )
            : undefined
        }))
      )
    }))
  );
}
