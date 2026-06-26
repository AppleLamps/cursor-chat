"use client";

import { useCallback, useState } from "react";
import { MAX_CHAT_IMAGES } from "@/lib/chat-images";
import type { ImageAttachment, PdfAttachment } from "@/lib/chat-types";
import { uid } from "@/lib/chat-conversation";
import {
  isImageAttachment,
  isPdfAttachment,
  isPdfUrl,
  isTextAttachment,
  readImageAsDataUrl,
  textAttachmentBlock
} from "@/lib/chat-attachments";

type UseAttachmentsOptions = {
  appendInput: (text: string) => void;
  focusInput: () => void;
  setError: (message: string | null) => void;
  setComposerNote: (message: string | null) => void;
};

export function useAttachments({
  appendInput,
  focusInput,
  setError,
  setComposerNote
}: UseAttachmentsOptions) {
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [pendingPdfs, setPendingPdfs] = useState<PdfAttachment[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);

  const clearPendingAttachments = useCallback(() => {
    setPendingImages([]);
    setPendingPdfs([]);
  }, []);

  const addAttachments = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;

      setIsReadingFiles(true);
      setError(null);

      try {
        const textBlocks: string[] = [];
        const imageBlocks: ImageAttachment[] = [];

        for (const file of Array.from(files)) {
          if (isImageAttachment(file)) {
            const image = await readImageAsDataUrl(file);

            imageBlocks.push({
              id: uid(),
              name: file.name,
              mimeType: image.mimeType,
              url: image.url
            });
            continue;
          }

          if (isPdfAttachment(file)) {
            throw new Error("PDF attachments are not supported. Use images or text.");
          }

          if (isTextAttachment(file)) {
            textBlocks.push(textAttachmentBlock(file.name, await file.text()));
            continue;
          }

          throw new Error(
            `${file.name} is not supported. Attach text files, PDFs, or PNG, JPEG, WebP, and GIF images.`
          );
        }

        if (textBlocks.length > 0) {
          appendInput(textBlocks.join("\n\n"));
        }

        if (imageBlocks.length > 0) {
          setPendingImages((current) => {
            const combined = [...current, ...imageBlocks];
            if (combined.length > MAX_CHAT_IMAGES) {
              throw new Error(
                `You can attach up to ${MAX_CHAT_IMAGES} images per message.`
              );
            }
            return combined;
          });
        }

        const notes = [
          textBlocks.length > 0
            ? `${textBlocks.length.toLocaleString()} text attachment${textBlocks.length === 1 ? "" : "s"} added`
            : "",
          imageBlocks.length > 0
            ? `${imageBlocks.length.toLocaleString()} image${imageBlocks.length === 1 ? "" : "s"} added`
            : ""
        ].filter(Boolean);

        if (notes.length > 0) {
          setComposerNote(`${notes.join(" and ")} to the prompt.`);
        }

        focusInput();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not read that file."
        );
      } finally {
        setIsReadingFiles(false);
      }
    },
    [appendInput, focusInput, setComposerNote, setError]
  );

  const removePendingImage = useCallback(
    (id: string) => {
      setPendingImages((current) => {
        const next = current.filter((image) => image.id !== id);
        if (next.length === 0 && pendingPdfs.length === 0) {
          setComposerNote(null);
        }
        return next;
      });
    },
    [pendingPdfs.length, setComposerNote]
  );

  const removePendingPdf = useCallback(
    (id: string) => {
      setPendingPdfs((current) => {
        const next = current.filter((pdf) => pdf.id !== id);
        if (next.length === 0 && pendingImages.length === 0) {
          setComposerNote(null);
        }
        return next;
      });
    },
    [pendingImages.length, setComposerNote]
  );

  const addHostedImageUrl = useCallback(() => {
    const url = window.prompt("Paste a public image URL")?.trim();

    if (!url) return;

    try {
      const parsed = new URL(url);

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Use a public http or https image URL.");
      }

      if (isPdfUrl(parsed)) {
        throw new Error("PDF URLs are not supported. Use an image URL.");
      }

      setPendingImages((current) => {
        if (current.length >= MAX_CHAT_IMAGES) {
          throw new Error(
            `You can attach up to ${MAX_CHAT_IMAGES} images per message.`
          );
        }

        return [
          ...current,
          {
            id: uid(),
            name: parsed.pathname.split("/").pop() || "Hosted image",
            mimeType: "image/url",
            url
          }
        ];
      });
      setComposerNote("Hosted image URL added to the next message.");
      focusInput();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That image URL is not valid."
      );
    }
  }, [focusInput, setComposerNote, setError]);

  return {
    pendingImages,
    pendingPdfs,
    isReadingFiles,
    addAttachments,
    removePendingImage,
    removePendingPdf,
    addHostedImageUrl,
    clearPendingAttachments
  };
}
