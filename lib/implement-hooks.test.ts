import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
describe("documented Implement hooks", () => {
  it.each([ ["git commit -m scoped", "allow"], ["git push origin cursor/task", "allow"],
    ["git push origin main --force", "deny"], ["git reset --hard", "deny"], ["rm -rf project", "deny"] ])(
    "parses and evaluates %s without executing it", (command, permission) => {
      const profile = JSON.parse(readFileSync("docs/hooks.implement.example.json", "utf8"));
      const hook = profile.hooks.beforeShellExecution[0].command;
      const source = hook.slice('node -e "'.length, -1);
      const decisions: Array<{ permission: string }> = [];
      const output = (value: string) => decisions.push(JSON.parse(value));
      const exit = Symbol("exit");
      try {
        runInNewContext(source, { require: () => ({ readFileSync: () => JSON.stringify({ command }) }),
          console: { log: output, error: output }, process: { exit: () => { throw exit; } } });
      } catch (error) { if (error !== exit) throw error; }
      expect(decisions).toEqual([expect.objectContaining({ permission })]);
    }
  );
});
