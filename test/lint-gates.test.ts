import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

// The quality gates (20 lines/function, 3 params, depth 2, 400 lines/file)
// must hold at the boundary, on TypeScript source.
const eslint = new ESLint();

async function ruleIds(code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath: "src/sample.ts" });
  return result.messages.map((m) => m.ruleId);
}

function fn(lines: number): string {
  const body = Array(lines - 2).fill("  console.log(1);");
  return ["export function f(): void {", ...body, "}", ""].join("\n");
}

const nest = (depth: number): string =>
  "if (a) {".repeat(depth) + "console.log(1);" + "}".repeat(depth);

const cases: [string, string, string[]][] = [
  ["20-line function", fn(20), []],
  ["21-line function", fn(21), ["max-lines-per-function"]],
  [
    "3 params",
    "export const f = (a: number, b: number, c: number): number => a + b + c;\n",
    [],
  ],
  [
    "4 params",
    "export const f = (a: number, b: number, c: number, d: number): number => a + b + c + d;\n",
    ["max-params"],
  ],
  ["depth 2", `export function f(a: boolean): void {\n  ${nest(2)}\n}\n`, []],
  [
    "depth 3",
    `export function f(a: boolean): void {\n  ${nest(3)}\n}\n`,
    ["max-depth"],
  ],
  ["400-line file", "console.log(1);\n".repeat(400), []],
  ["401-line file", "console.log(1);\n".repeat(401), ["max-lines"]],
];

for (const [name, code, expected] of cases) {
  test(`lint: ${name}`, async () =>
    assert.deepEqual(await ruleIds(code), expected));
}
