// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Composer from "@/components/chat/Composer";

afterEach(cleanup);

function renderComposer(isSending: boolean) {
  return render(
    <Composer
      value="a follow-up I am drafting"
      images={[]}
      pdfs={[]}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      onKeyDown={vi.fn()}
      canSend={!isSending}
      isSending={isSending}
      isReadingFiles={false}
      isListening={false}
      note={null}
      placeholder="Ask about this repository"
      onAttachClick={vi.fn()}
      onHostedImageClick={vi.fn()}
      onRemoveImage={vi.fn()}
      onRemovePdf={vi.fn()}
      onToggleVoice={vi.fn()}
      onStop={vi.fn()}
      inputRef={createRef<HTMLTextAreaElement>()}
    />
  );
}

describe("Composer while the agent is working", () => {
  it("keeps the text box usable so the next message can be drafted", () => {
    const view = renderComposer(true);

    expect((view.getByPlaceholderText("Ask about this repository") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("swaps Send for Stop", () => {
    const view = renderComposer(true);

    expect(view.getByRole("button", { name: "Stop generating" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Send message" })).toBeNull();
  });
});
