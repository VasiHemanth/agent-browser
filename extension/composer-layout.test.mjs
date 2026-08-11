import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("sidepanel.css", import.meta.url), "utf8");
const js = await readFile(new URL("sidepanel.js", import.meta.url), "utf8");

const composer = css.match(/#composer\s*\{([\s\S]*?)\n\}/)?.[1] || "";
const input = css.match(/#input\s*\{([\s\S]*?)\n\}/)?.[1] || "";

assert.match(composer, /max-height:\s*min\(196px,\s*32dvh\)/,
  "the composer must stay bounded instead of consuming the empty panel");
assert.match(composer, /overflow-y:\s*auto/,
  "overflowing context belongs inside the composer, not in an oversized field");
assert.match(input, /min-height:\s*48px/,
  "an empty field should be comfortably tappable without being oversized");
assert.match(input, /max-height:\s*112px/,
  "long prompts should scroll instead of turning the composer into a large canvas");
assert.match(js, /Math\.min\(inputEl\.scrollHeight,\s*112\)/,
  "JavaScript auto-grow must use the same compact input cap");

console.log("5 composer layout checks passed");
