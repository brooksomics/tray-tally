import { stripTypeScriptTypes } from "node:module";
import js from "@eslint/js";

// Core ESLint can't parse TypeScript. Node's own stripper blanks out types in
// place, so line/column numbers stay exact and lint sees what Node executes.
// ponytail: experimental Node API (warning muted in npm run lint); swap in
// typescript-eslint's parser if it changes or type-aware rules are wanted.
const stripTypes = {
  preprocess: (text) => [stripTypeScriptTypes(text)],
  postprocess: (messages) => messages.flat(),
};

export default [
  { ignores: ["dashboard/vendor/"] },
  js.configs.recommended,
  {
    rules: {
      "max-lines-per-function": ["error", 20],
      "max-params": ["error", 3],
      "max-depth": ["error", 2],
      "max-lines": ["error", 400],
      // allow `const { a, ...rest } = x` to drop fields
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  // The dashboard runs in the browser.
  {
    files: ["dashboard/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        Event: "readonly",
        location: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Plot: "readonly", // vendor/plot.umd.min.js, loaded by index.html
      },
    },
  },
  // tsc already checks names (and knows Node's globals via @types/node).
  {
    files: ["**/*.ts"],
    processor: stripTypes,
    rules: { "no-undef": "off" },
  },
];
