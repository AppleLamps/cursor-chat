// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Composer from "@/components/chat/Composer";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(overrides: Partial<ComponentProps<typeof Composer>> = {}) {
  const props: ComponentProps<typeof Composer> = {
    value: "", images: [], pdfs: [], onChange: vi.fn(), onSubmit: vi.fn(e => e.preventDefault()),
    onKeyDown: vi.fn(), canSend: true, isSending: false, isReadingFiles: false,
    isListening: false, note: null, placeholder: "Ask about this repository",
    onAttachClick: vi.fn(), onHostedImageClick: vi.fn(), onRemoveImage: vi.fn(),
    onRemovePdf: vi.fn(), onToggleVoice: vi.fn(), onStop: vi.fn(),
    inputRef: createRef<HTMLTextAreaElement>(), ...overrides
  };
  return { props, ...render(<Composer {...props} />) };
}

describe("adaptive composer", () => {
  it("uses one shared row for attachments, text and send with touch-sized controls", () => {
    const view = setup();
    const row = view.container.querySelector('[data-slot="composer-input-row"]');
    const text = view.getByRole("textbox") as HTMLTextAreaElement;
    expect(text.parentElement).toBe(row);
    expect(row?.contains(view.getByRole("button", {name: "Send message"}))).toBe(true);
    expect(row?.contains(view.getByRole("button", {name: "Add attachment"}))).toBe(true);
    expect(text.rows).toBe(1);
    expect(text.className).toContain("min-h-11");
    expect(text.className).toContain("min-w-0");
    expect(text.className).toContain("max-h-20");
    expect(view.getByRole("button", {name: "Send message"}).className).toContain("size-11");
  });

  it("grows with a multiline draft and shrinks after clearing", () => {
    let height = 44;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
    const view = setup();
    const text = view.getByRole("textbox") as HTMLTextAreaElement;
    expect(text.style.height).toBe("44px");
    height = 116;
    view.rerender(<Composer {...view.props} value={"First line\nSecond line\nThird line"} />);
    expect(text.style.height).toBe("116px");
    height = 44;
    view.rerender(<Composer {...view.props} value="" />);
    expect(text.style.height).toBe("44px");
  });

  it("remeasures wrapping after a width change without a resize feedback loop", () => {
    let callback: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(cb: () => void) { callback = cb; }
      observe() {}
      disconnect = disconnect;
    });
    let width = 500;
    let height = 44;
    vi.spyOn(HTMLTextAreaElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    const scrollHeight = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
    const view = setup({value: "A long draft that wraps as the sidebar changes"});
    width = 220;
    height = 92;
    act(() => callback?.());
    expect((view.getByRole("textbox") as HTMLTextAreaElement).style.height).toBe("92px");
    scrollHeight.mockClear();
    act(() => callback?.());
    expect(scrollHeight).not.toHaveBeenCalled();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("dismisses the attachment menu with Escape without invoking an action", async () => {
    const view = setup();
    const trigger = view.getByRole("button", {name: "Add attachment"});
    trigger.focus();
    fireEvent.keyDown(trigger, {key: "Enter"});
    const menu = await view.findByRole("menu");
    fireEvent.keyDown(menu, {key: "Escape"});
    await waitFor(() => expect(view.queryByRole("menu")).toBeNull());
    expect(view.props.onAttachClick).not.toHaveBeenCalled();
    expect(view.props.onHostedImageClick).not.toHaveBeenCalled();
  });

  it("keeps drafting enabled while Stop replaces Send and attachments are disabled", () => {
    const view = setup({isSending: true});
    expect((view.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false);
    expect(view.queryByRole("button", {name: "Send message"})).toBeNull();
    expect((view.getByRole("button", {name: "Add attachment"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByRole("button", {name: "Stop generating"}));
    expect(view.props.onStop).toHaveBeenCalledOnce();
  });

  it("opens both attachment actions by keyboard and closes after selection", async () => {
    const view = setup();
    const trigger = view.getByRole("button", {name: "Add attachment"});
    fireEvent.keyDown(trigger, {key: "Enter"});
    fireEvent.click(await view.findByRole("menuitem", {name: "Add image"}));
    expect(view.props.onAttachClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(view.queryByRole("menu")).toBeNull());
    fireEvent.keyDown(trigger, {key: "Enter"});
    fireEvent.click(await view.findByRole("menuitem", {name: "Image from URL"}));
    expect(view.props.onHostedImageClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(view.queryByRole("menu")).toBeNull());
  });

  it("preserves attachments, removal, submission and keyboard handlers", () => {
    const view = setup({images: [{id: "img", name: "design.png", mimeType: "image/png", url: "https://example.com/design.png"}]});
    expect(view.getByAltText("design.png")).toBeTruthy();
    fireEvent.click(view.getByRole("button", {name: "Remove design.png"}));
    expect(view.props.onRemoveImage).toHaveBeenCalledWith("img");
    fireEvent.change(view.getByRole("textbox"), {target: {value: "Hello"}});
    expect(view.props.onChange).toHaveBeenCalledWith("Hello");
    fireEvent.keyDown(view.getByRole("textbox"), {key: "Enter", shiftKey: true});
    expect(view.props.onKeyDown).toHaveBeenCalledOnce();
    fireEvent.click(view.getByRole("button", {name: "Send message"}));
    expect(view.props.onSubmit).toHaveBeenCalledOnce();
  });

  it("keeps important mode notes visible even with the mobile keyboard", () => {
    const view = setup({note: "Implement mode can change repository files."});
    expect(view.getByText("Implement mode can change repository files.").className).not.toContain("hidden");
  });
});
