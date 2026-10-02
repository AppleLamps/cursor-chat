// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
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
});
