import { describe, expect, it } from "vitest";
import { syncAppViewport } from "@/hooks/useAppViewport";

function fakeRoot() {
  const props = new Map<string, string>();
  return {
    props,
    root: {
      style: { setProperty: (k: string, v: string) => props.set(k, v) }
    } as unknown as HTMLElement
  };
}

describe("syncAppViewport", () => {
  it("mirrors the visual viewport so the app shell sits above the keyboard", () => {
    const { root, props } = fakeRoot();

    syncAppViewport(root, { height: 508.4, offsetTop: 0 });

    expect(props.get("--app-height")).toBe("508px");
    expect(props.get("--app-top")).toBe("0px");
  });

  it("follows the visual viewport when iOS pans it", () => {
    const { root, props } = fakeRoot();

    syncAppViewport(root, { height: 420, offsetTop: 96.6 });

    expect(props.get("--app-top")).toBe("97px");
  });

  it("never reports a negative offset (rubber-banding)", () => {
    const { root, props } = fakeRoot();

    syncAppViewport(root, { height: 800, offsetTop: -12 });

    expect(props.get("--app-top")).toBe("0px");
  });
});
