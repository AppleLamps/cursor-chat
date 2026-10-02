// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UndoToast, { UNDO_DELETE_MS } from "@/components/chat/UndoToast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("UndoToast", () => {
  it("announces the deletion and lets the user undo it", () => {
    const onUndo = vi.fn();
    const view = render(
      <UndoToast message='Deleted "Billing webhooks"' onUndo={onUndo} onExpire={() => {}} />
    );

    expect(view.getByRole("status").textContent).toContain("Billing webhooks");
    fireEvent.click(view.getByRole("button", { name: "Undo" }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("expires after the undo window", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<UndoToast message="Deleted" onUndo={() => {}} onExpire={onExpire} />);

    act(() => vi.advanceTimersByTime(UNDO_DELETE_MS - 1));
    expect(onExpire).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not expire if it is dismissed first", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const view = render(<UndoToast message="Deleted" onUndo={() => {}} onExpire={onExpire} />);

    view.unmount();
    act(() => vi.advanceTimersByTime(UNDO_DELETE_MS * 2));

    expect(onExpire).not.toHaveBeenCalled();
  });
});
