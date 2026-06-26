const MAX_TEXT_ATTACHMENT_CHARS = 500_000;
const MAX_IMAGE_DATA_URL_CHARS = 850_000;
const IMAGE_MAX_DIMENSION = 1400;
const IMAGE_COMPRESSION_QUALITY = 0.82;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);

const TEXT_ATTACHMENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values"
]);

export function isTextAttachment(file: File) {
  return file.type.startsWith("text/") || TEXT_ATTACHMENT_TYPES.has(file.type);
}

export function isImageAttachment(file: File) {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

export function isPdfAttachment(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isPdfUrl(url: URL) {
  return url.pathname.toLowerCase().endsWith(".pdf");
}

export function fileFenceLanguage(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension) return "text";

  if (["csv", "html", "json", "log", "md", "ts", "tsx", "txt", "xml"].includes(extension)) {
    return extension === "txt" ? "text" : extension;
  }

  return "text";
}

export function textAttachmentBlock(fileName: string, text: string) {
  const clipped =
    text.length > MAX_TEXT_ATTACHMENT_CHARS
      ? `${text.slice(0, MAX_TEXT_ATTACHMENT_CHARS)}\n\n[Truncated after ${MAX_TEXT_ATTACHMENT_CHARS.toLocaleString()} characters.]`
      : text;

  return `Attached file: ${fileName}\n\n\`\`\`${fileFenceLanguage(fileName)}\n${clipped}\n\`\`\``;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error(`Could not read ${file.name}.`));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not process that image."));
    image.src = dataUrl;
  });
}

export async function readImageAsDataUrl(file: File) {
  const originalUrl = await readFileAsDataUrl(file);

  if (
    originalUrl.length <= MAX_IMAGE_DATA_URL_CHARS ||
    file.type === "image/gif"
  ) {
    return { url: originalUrl, mimeType: file.type };
  }

  const image = await loadImage(originalUrl);
  const scale = Math.min(
    1,
    IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return { url: originalUrl, mimeType: file.type };

  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return {
    url: canvas.toDataURL("image/jpeg", IMAGE_COMPRESSION_QUALITY),
    mimeType: "image/jpeg"
  };
}
