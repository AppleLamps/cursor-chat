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
});
