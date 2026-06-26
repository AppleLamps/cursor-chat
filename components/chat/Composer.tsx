"use client";

import { FormEvent, KeyboardEvent, RefObject } from "react";
import type { ImageAttachment, PdfAttachment } from "@/lib/chat-types";

export default function Composer({
  value,
  images,
  pdfs,
  onChange,
  onSubmit,
  onKeyDown,
  canSend,
  isSending,
  isReadingFiles,
  isListening,
  note,
  placeholder,
  onAttachClick,
  onHostedImageClick,
  onRemoveImage,
  onRemovePdf,
  onToggleVoice,
  inputRef
}: {
  value: string;
  images: ImageAttachment[];
  pdfs: PdfAttachment[];
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  canSend: boolean;
  isSending: boolean;
  isReadingFiles: boolean;
  isListening: boolean;
  note: string | null;
  placeholder: string;
  onAttachClick: () => void;
  onHostedImageClick: () => void;
  onRemoveImage: (id: string) => void;
  onRemovePdf: (id: string) => void;
  onToggleVoice: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
      <div className="rounded-[1.75rem] border border-[#d9d9d9] bg-white p-2 shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition focus-within:border-[#bdbdbd]">
        {images.length > 0 || pdfs.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto px-2 pb-2 pt-1">
            {images.map((image) => (
              <div
                key={image.id}
                className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-[#d9d9d9] bg-[#f7f7f8]"
                title={image.name}
              >
                <img
                  src={image.url}
                  alt={image.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(image.id)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-sm text-white transition hover:bg-black"
                  aria-label={`Remove ${image.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            {pdfs.map((pdf) => (
              <div
                key={pdf.id}
                className="relative flex h-16 w-72 max-w-[80vw] shrink-0 items-center gap-3 rounded-xl border border-[#d9d9d9] bg-[#f7f7f8] px-3 pr-9 text-sm text-[#222]"
                title={pdf.name}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ff4f45] text-xs font-bold text-white">
                  PDF
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{pdf.name}</span>
                  <span className="text-xs text-[#777]">PDF</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePdf(pdf.id)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-sm text-white transition hover:bg-black"
                  aria-label={`Remove ${pdf.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          className="max-h-44 min-h-[46px] w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 text-[#0d0d0d] outline-none placeholder:text-[#9b9b9b]"
          disabled={isSending}
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAttachClick}
              disabled={isSending || isReadingFiles}
              className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-[#6f6f6f] transition hover:bg-[#f1f1f1] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              aria-label="Add image"
              title="Attach PNG, JPEG, WebP, or GIF"
            >
              {isReadingFiles ? "..." : "+"}
            </button>
            <button
              type="button"
              onClick={onHostedImageClick}
              disabled={isSending || isReadingFiles}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-[#6f6f6f] transition hover:bg-[#f1f1f1] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] disabled:cursor-not-allowed disabled:text-[#b6b6b6]"
              title="Attach hosted image URL"
            >
              URL
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleVoice}
              className="hidden h-8 w-8 items-center justify-center rounded-full text-[#6f6f6f] transition hover:bg-[#f1f1f1] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] sm:flex"
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              title={isListening ? "Stop voice input" : "Start voice input"}
            >
              {isListening ? (
                <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <path d="M12 18v3" />
                  <path d="M8 21h8" />
                </svg>
              )}
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white shadow-sm transition hover:bg-[#303030] focus:outline-none focus:ring-4 focus:ring-black/10 disabled:cursor-not-allowed disabled:bg-[#d9d9d9] disabled:text-white disabled:shadow-none"
              aria-label="Send message"
            >
              {isSending ? "..." : "↑"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-[#8a8a8a]">
        {note || "AI can make mistakes. Check important info."}
      </p>
    </form>
  );
}
