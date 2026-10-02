// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogFocus } from "@/hooks/useDialogFocus";

afterEach(cleanup);

function Dialog({
  label,
  onClose,
  children
}: {
  label: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, { active: true, onClose });

  return (
    <div ref={ref} role="dialog" aria-label={label}>
      <button>{label} first</button>
      <button>{label} last</button>
      {children}
    </div>
  );
}

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open ? (
        <Dialog
          label="Outer"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

describe("useDialogFocus", () => {
  it("moves focus in, traps Tab both ways, and restores focus on close", () => {
    const view = render(<Harness />);
    const opener = view.getByText("Open");
    opener.focus();
    fireEvent.click(opener);

    const first = screen.getByText("Outer first");
    const last = screen.getByText("Outer last");
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes only the innermost dialog on Escape", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    function Nested() {
      const [inner, setInner] = useState(false);
      return (
        <Dialog label="Outer" onClose={outerClose}>
          <button onClick={() => setInner(true)}>Show inner</button>
          {inner ? <Dialog label="Inner" onClose={innerClose} /> : null}
        </Dialog>
      );
    }
    render(<Nested />);
    fireEvent.click(screen.getByText("Show inner"));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });

  it("honors data-autofocus", () => {
    function Autofocus() {
      const ref = useRef<HTMLDivElement>(null);
      useDialogFocus(ref, { active: true });
      return (
        <div ref={ref}>
          <button>one</button>
          <input aria-label="two" data-autofocus />
        </div>
      );
    }
    render(<Autofocus />);

    expect(document.activeElement).toBe(screen.getByLabelText("two"));
  });
});
