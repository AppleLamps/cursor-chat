import { readFileSync } from "node:fs";
import postcss, { type Rule } from "postcss";
import tailwindcss from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../../tailwind.config";

// These are compiled CSS contract checks, not browser geometry assertions.
// Behavioral tests exercise the actual React hierarchy separately.
let root: postcss.Root;
beforeAll(async () => {
  const source = ["components/ChatApp.tsx", "components/chat/Composer.tsx", "components/chat/MessageBubble.tsx", "components/chat/ArtifactsPanel.tsx"]
    .map(path => readFileSync(path, "utf8")).join("\n");
  root = (await postcss([tailwindcss({...config, content: [{raw: source, extension: "tsx"}]})]).process("@tailwind utilities;", {from: undefined})).root;
});
function declarations(selector: string, media?: string) {
  const values: Record<string, string> = {};
  root.walkRules((rule: Rule) => {
    if (rule.selector !== selector) return;
    const parent = rule.parent;
    if (media && !(parent?.type === "atrule" && parent.params === media)) return;
    rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  });
  return values;
}
describe("chat layout CSS contract", () => {
  it("gives the transcript remaining flex height and a zero minimum", () => {
    expect(declarations(".basis-0")["flex-basis"]).toBe("0px");
    expect(declarations(".min-h-0")["min-height"]).toBe("0px");
    expect(declarations(".flex-1").flex).toBe("1 1 0%");
    expect(declarations(".shrink-0")["flex-shrink"]).toBe("0");
  });
  it("uses 44px controls with bounded multiline input", () => {
    expect(declarations(".size-11")).toMatchObject({height: "2.75rem", width: "2.75rem"});
    expect(declarations(".min-h-11")["min-height"]).toBe("2.75rem");
    expect(declarations(".max-h-40")["max-height"]).toBe("10rem");
    expect(declarations(".sm\\:max-h-44", "(min-width: 640px)")["max-height"]).toBe("11rem");
    let keyboardCap = false;
    root.walkAtRules(rule => {
      if (`${rule.name}${rule.params}`.replaceAll(" ", "") !== "media(max-height:500px)") return;
      rule.walkDecls("max-height", decl => { if (decl.value === "5rem") keyboardCap = true; });
    });
    expect(keyboardCap).toBe(true);
  });
  it("compiles mobile safe-area spacing without a composer-height reservation", () => {
    const source = readFileSync("components/ChatApp.tsx", "utf8");
    expect(source).not.toContain("pb-[calc(var(--composer-h");
    let safeBottom = false;
    root.walkDecls("padding-bottom", decl => {
      if (decl.value.includes("env(safe-area-inset-bottom)")) safeBottom = true;
    });
    expect(safeBottom).toBe(true);
  });
});
