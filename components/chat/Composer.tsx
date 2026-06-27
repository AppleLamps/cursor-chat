"use client";

import { FormEvent, KeyboardEvent, RefObject } from "react";
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
      <div className="rounded-2xl border border-border bg-card p-2 shadow-lg shadow-foreground/10 transition focus-within:border-ring">
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
          className="max-h-44 min-h-[50px] w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
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
            <Button
              type="submit"
              size="icon-lg"
              disabled={!canSend}
              aria-label="Send message"
              className="h-10 w-10 rounded-full bg-black text-white shadow-sm hover:bg-black/90 focus-visible:ring-black/30 disabled:bg-muted disabled:text-muted-foreground"
            >
              <SendIcon className={isSending ? "animate-pulse" : ""} />
            </Button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        {note || "AI can make mistakes. Check important info."}
      </p>
    </form>
  );
}
