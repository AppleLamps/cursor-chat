import { describe, expect, it } from "vitest";
import {
  fileFenceLanguage,
  isImageAttachment,
  isPdfAttachment,
  isTextAttachment,
  textAttachmentBlock
} from "@/lib/chat-attachments";

function file(name: string, type: string, text = "") {
  return new File([text], name, { type });
}

describe("chat attachment helpers", () => {
  it("classifies supported image, text, and pdf attachments", () => {
    expect(isImageAttachment(file("screen.png", "image/png"))).toBe(true);
    expect(isTextAttachment(file("notes.md", "text/markdown"))).toBe(true);
    expect(isPdfAttachment(file("report.pdf", "application/octet-stream"))).toBe(true);
  });

  it("formats fenced text blocks and known languages", () => {
    expect(fileFenceLanguage("Component.tsx")).toBe("tsx");
    expect(fileFenceLanguage("README.txt")).toBe("text");
    expect(textAttachmentBlock("README.md", "hello")).toContain("```md\nhello");
  });

  it("truncates large text attachments", () => {
    const block = textAttachmentBlock("large.txt", "x".repeat(500_005));
    expect(block).toContain("[Truncated after 500,000 characters.]");
  });
});
