"use client";

import { FormEvent, KeyboardEvent, RefObject, useLayoutEffect } from "react";
import { ArrowUpIcon, ImageIcon, LinkIcon, MicIcon, PaperclipIcon, PlusIcon, SquareIcon, XIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ImageAttachment, PdfAttachment } from "@/lib/chat-types";
import { Button } from "@/components/ui/button";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle
} from "@/components/ui/attachment";

export default function Composer({
  value,
  images,
  pdfs,
  onChange,
  onSubmit,
  onKeyDown,
  canSend,
  isSending,
  canStop = true,
  isReadingFiles,
  isListening,
  note,
  placeholder,
  onAttachClick,
  onHostedImageClick,
  onRemoveImage,
  onRemovePdf,
  onToggleVoice,
  onStop,
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
  canStop?: boolean;
  isReadingFiles: boolean;
  isListening: boolean;
  note: string | null;
  placeholder: string;
  onAttachClick: () => void;
  onHostedImageClick: () => void;
  onRemoveImage: (id: string) => void;
  onRemovePdf: (id: string) => void;
  onToggleVoice: () => void;
  onStop: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  // Grow with the text (up to the CSS max-height), then scroll inside.
  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, inputRef]);

  // Reflow a wrapped draft when the viewport or sidebar changes width, too.
  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [inputRef]);

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
      <div className="rounded-3xl border border-border bg-card p-1.5 shadow-sm transition focus-within:border-ring sm:p-2">
        {images.length > 0 || pdfs.length > 0 ? (
          <AttachmentGroup className="max-h-36 px-2 pb-2 pt-1 [@media(max-height:500px)]:max-h-24">
            {images.map((image) => (
              <Attachment
                key={image.id}
                orientation="vertical"
                className="w-28 overflow-hidden"
                title={image.name}
              >
                <AttachmentMedia variant="image" className="h-16 [@media(max-height:500px)]:h-10">
                  <img src={image.url} alt={image.name} />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{image.name}</AttachmentTitle>
                  <AttachmentDescription>{image.mimeType}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    type="button"
                    onClick={() => onRemoveImage(image.id)}
                    aria-label={`Remove ${image.name}`}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
            {pdfs.map((pdf) => (
              <Attachment key={pdf.id} className="w-72 max-w-[80vw]" title={pdf.name}>
                <AttachmentMedia>
                  <span className="text-[10px] font-bold">PDF</span>
                </AttachmentMedia>
                <AttachmentContent className="pr-2">
                  <AttachmentTitle>{pdf.name}</AttachmentTitle>
                  <AttachmentDescription>PDF</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    type="button"
                    onClick={() => onRemovePdf(pdf.id)}
                    aria-label={`Remove ${pdf.name}`}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </AttachmentGroup>
        ) : null}
        <div className="flex items-end gap-1" data-slot="composer-input-row">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label="Add attachment"
                title="Add attachment"
                disabled={isSending || isReadingFiles}
                className="size-11 shrink-0 rounded-full"
              >
                {isReadingFiles ? <PaperclipIcon className="animate-pulse" /> : <PlusIcon />}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="top"
                align="start"
                sideOffset={8}
                className="z-50 min-w-52 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
              >
                <DropdownMenu.Item
                  onSelect={onAttachClick}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 outline-none focus:bg-accent"
                >
                  <ImageIcon className="size-4" /> Add image
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={onHostedImageClick}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 outline-none focus:bg-accent"
                >
                  <LinkIcon className="size-4" /> Image from URL
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <textarea
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            rows={1}
            enterKeyHint="enter"
            autoCapitalize="sentences"
            className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:max-h-44 [@media(max-height:500px)]:max-h-20"
          />
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleVoice}
              className="hidden size-11 rounded-full max-md:size-11 sm:inline-flex"
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              title={isListening ? "Stop voice input" : "Start voice input"}
            >
              {isListening ? <SquareIcon className="fill-current" /> : <MicIcon />}
            </Button>
            {isSending ? (
              <Button
                type="button"
                size="icon-lg"
                onClick={onStop}
                disabled={!canStop}
                aria-label="Stop generating"
                title="Stop generating"
                className="size-11 shrink-0 rounded-full bg-black text-white shadow-sm hover:bg-black/90 focus-visible:ring-black/30"
              >
                <SquareIcon className="fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-lg"
                disabled={!canSend}
                aria-label="Send message"
                className="size-11 shrink-0 rounded-full bg-black text-white shadow-sm hover:bg-black/90 focus-visible:ring-black/30 disabled:bg-muted disabled:text-muted-foreground"
              >
                <ArrowUpIcon />
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className={`mt-1.5 text-center text-[11px] leading-4 text-muted-foreground ${note ? "" : "[@media(max-height:500px)]:hidden"}`}>
        {note || "AI can make mistakes. Check important info."}
      </p>
    </form>
  );
}
