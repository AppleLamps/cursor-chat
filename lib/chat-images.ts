import type { SDKImage } from "@cursor/sdk";

/** Cursor Cloud Agents API limit */
export const MAX_CHAT_IMAGES = 5;

/** Allow base64 image payloads in JSON (well under Cursor's 15 MB per-image cap). */
export const MAX_CHAT_BODY_BYTES = 20_000_000;

export type ChatImageInput = {
  url: string;
  mimeType?: string;
};

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    data: match[2]
  };
}

export function parseChatImages(raw: unknown): ChatImageInput[] {
  if (!Array.isArray(raw)) return [];

  const images: ChatImageInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const url =
      "url" in item && typeof item.url === "string" ? item.url.trim() : "";
    if (!url) continue;

    const mimeType =
      "mimeType" in item && typeof item.mimeType === "string"
        ? item.mimeType.trim()
        : undefined;

    images.push({ url, mimeType });

    if (images.length >= MAX_CHAT_IMAGES) break;
  }

  return images;
}

export function chatImagesToSdk(images: ChatImageInput[]): SDKImage[] {
  const sdkImages: SDKImage[] = [];

  for (const image of images.slice(0, MAX_CHAT_IMAGES)) {
    const url = image.url.trim();
    if (!url) continue;

    if (url.startsWith("http://") || url.startsWith("https://")) {
      sdkImages.push({ url });
      continue;
    }

    const dataUrl = parseDataUrl(url);
    if (dataUrl) {
      sdkImages.push({
        data: dataUrl.data,
        mimeType: dataUrl.mimeType
      });
    }
  }

  return sdkImages;
}
