// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Onboarding from "@/components/Onboarding";

afterEach(cleanup);

describe("Onboarding", () => {
  it("keeps persistent credential storage opt-in", () => {
    const onComplete = vi.fn();
    const view = render(<Onboarding onComplete={onComplete} />);
    const remember = view.getByRole("checkbox") as HTMLInputElement;

    expect(remember.checked).toBe(false);

    fireEvent.change(view.getByLabelText("Cursor API key"), {
      target: { value: "cursor_valid_key_123" }
    });
    fireEvent.submit(view.getByRole("button", { name: "Continue" }).closest("form")!);

    expect(onComplete).toHaveBeenCalledWith({
      apiKey: "cursor_valid_key_123",
      githubToken: undefined,
      remember: false
    });
  });

  it("shows only the token field when GitHub sign-in is not configured", () => {
    const view = render(<Onboarding onComplete={vi.fn()} />);

    expect(view.queryByRole("button", { name: "Connect GitHub" })).toBeNull();
    expect(view.getByLabelText("GitHub token")).toBeTruthy();
  });

  it("starts GitHub sign-in carrying the typed key and remember choice", () => {
    const onConnectGitHub = vi.fn();
    const view = render(
      <Onboarding onComplete={vi.fn()} onConnectGitHub={onConnectGitHub} />
    );

    fireEvent.change(view.getByLabelText("Cursor API key"), {
      target: { value: "cursor_valid_key_123" }
    });
    fireEvent.click(view.getByRole("checkbox"));
    fireEvent.click(view.getByRole("button", { name: "Connect GitHub" }));

    expect(onConnectGitHub).toHaveBeenCalledWith({
      apiKey: "cursor_valid_key_123",
      remember: true
    });
  });

  it("keeps the connected GitHub token when continuing", () => {
    const onComplete = vi.fn();
    const view = render(
      <Onboarding
        onComplete={onComplete}
        githubToken="gho_connectedtoken1234567890"
        onConnectGitHub={vi.fn()}
      />
    );

    expect(view.getByText("✓ GitHub connected")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Connect GitHub" })).toBeNull();

    fireEvent.change(view.getByLabelText("Cursor API key"), {
      target: { value: "cursor_valid_key_123" }
    });
    fireEvent.submit(view.getByRole("button", { name: "Continue" }).closest("form")!);

    expect(onComplete).toHaveBeenCalledWith({
      apiKey: "cursor_valid_key_123",
      githubToken: "gho_connectedtoken1234567890",
      remember: false
    });
  });

  it("shows a GitHub sign-in error", () => {
    const view = render(
      <Onboarding
        onComplete={vi.fn()}
        githubError="GitHub sign-in was cancelled."
        onConnectGitHub={vi.fn()}
      />
    );

    expect(view.getByText("GitHub sign-in was cancelled.")).toBeTruthy();
  });

  describe("Connect Cursor", () => {
    it("offers no button unless sign-in is wired up", () => {
      const view = render(<Onboarding onComplete={vi.fn()} />);

      expect(view.queryByRole("button", { name: "Connect Cursor" })).toBeNull();
    });

    it("fills in the minted key and lets the user continue", async () => {
      const onComplete = vi.fn();
      const onConnectCursor = vi.fn(async ({ onUrl }) => {
        onUrl("https://cursor.com/login?c=1");
        return { apiKey: "cursor_minted_key_123456", email: "me@example.com" };
      });
      const view = render(
        <Onboarding onComplete={onComplete} onConnectCursor={onConnectCursor} />
      );

      fireEvent.click(view.getByRole("button", { name: "Connect Cursor" }));

      await waitFor(() =>
        expect(view.getByText(/Cursor connected as me@example.com/)).toBeTruthy()
      );
      expect((view.getByLabelText("Cursor API key") as HTMLInputElement).value).toBe(
        "cursor_minted_key_123456"
      );

      fireEvent.submit(view.getByRole("button", { name: "Continue" }).closest("form")!);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "cursor_minted_key_123456" })
      );
    });

    it("shows the sign-in link while waiting and can be cancelled", async () => {
      let signal: AbortSignal | undefined;
      const onConnectCursor = vi.fn(
        ({ onUrl, signal: s }: { onUrl: (u: string) => void; signal: AbortSignal }) => {
          signal = s;
          onUrl("https://cursor.com/login?c=2");
          return new Promise<{ apiKey: string }>(() => undefined);
        }
      );
      const view = render(
        <Onboarding onComplete={vi.fn()} onConnectCursor={onConnectCursor} />
      );

      fireEvent.click(view.getByRole("button", { name: "Connect Cursor" }));

      const link = await view.findByRole("link", {
        name: "Open the Cursor sign-in page"
      });
      expect(link.getAttribute("href")).toBe("https://cursor.com/login?c=2");

      fireEvent.click(view.getByRole("button", { name: "Cancel" }));
      expect(signal?.aborted).toBe(true);
      expect(view.getByRole("button", { name: "Connect Cursor" })).toBeTruthy();
    });

    it("shows a failure and keeps pasting available", async () => {
      const view = render(
        <Onboarding
          onComplete={vi.fn()}
          onConnectCursor={vi.fn().mockRejectedValue(new Error("Login was denied."))}
        />
      );

      fireEvent.click(view.getByRole("button", { name: "Connect Cursor" }));

      expect((await view.findByRole("alert")).textContent).toBe("Login was denied.");
      expect(view.getByLabelText("Cursor API key")).toBeTruthy();
      expect(view.getByRole("button", { name: "Connect Cursor" })).toBeTruthy();
    });
  });
});
