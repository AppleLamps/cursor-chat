"use client";

import { FormEvent, KeyboardEvent, RefObject, useLayoutEffect } from "react";
import { ImageIcon, LinkIcon, MicIcon, PaperclipIcon, SendIcon, SquareIcon, XIcon } from "lucide-react";
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

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
      <div className="rounded-[1.375rem] border border-border bg-card p-1.5 shadow-lg shadow-foreground/10 transition focus-within:border-ring sm:rounded-2xl sm:p-2">
        {images.length > 0 || pdfs.length > 0 ? (
          <AttachmentGroup className="px-2 pb-3 pt-1">
            {images.map((image) => (
              <Attachment
                key={image.id}
                orientation="vertical"
                className="w-28 overflow-hidden"
                title={image.name}
              >
                <AttachmentMedia variant="image" className="h-24">
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
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          enterKeyHint="enter"
          autoCapitalize="sentences"
          className="max-h-40 min-h-[50px] w-full resize-none bg-transparent px-3.5 py-3 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:max-h-44 sm:px-4 [@media(max-height:500px)]:max-h-20"
          disabled={isSending}
        />
        <div className="flex items-center justify-between px-2 pb-1 pt-1">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onAttachClick}
              disabled={isSending || isReadingFiles}
              aria-label="Add image"
              title="Attach PNG, JPEG, WebP, or GIF"
              className="max-md:size-11 max-md:[&_svg:not([class*='size-'])]:size-5"
            >
              {isReadingFiles ? <PaperclipIcon className="animate-pulse" /> : <ImageIcon />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onHostedImageClick}
              disabled={isSending || isReadingFiles}
              title="Attach hosted image URL"
              className="max-md:h-11 max-md:px-3.5 max-md:text-sm"
            >
              <LinkIcon />
              URL
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleVoice}
              className="hidden sm:inline-flex"
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
                aria-label="Stop generating"
                title="Stop generating"
                className="h-11 w-11 rounded-full bg-black text-white shadow-sm hover:bg-black/90 focus-visible:ring-black/30 md:h-10 md:w-10"
              >
                <SquareIcon className="fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-lg"
                disabled={!canSend}
                aria-label="Send message"
                className="h-11 w-11 rounded-full bg-black text-white shadow-sm hover:bg-black/90 focus-visible:ring-black/30 disabled:bg-muted disabled:text-muted-foreground md:h-10 md:w-10"
              >
                <SendIcon />
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] leading-4 text-muted-foreground sm:mt-2 [@media(max-height:500px)]:hidden">
        {note || "AI can make mistakes. Check important info."}
      </p>
    </form>
  );
}
