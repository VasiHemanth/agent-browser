import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidepanel = await readFile(new URL("sidepanel.html", import.meta.url), "utf8");
const css = await readFile(new URL("sidepanel.css", import.meta.url), "utf8");

assert.match(sidepanel, /id="logo"[\s\S]*?#22C55E[\s\S]*?#F5FAF7/, "the header should contain the AgentBrowser iris mark");
assert.match(sidepanel, /class="ab-loader"[\s\S]*?aria-label="Agent working"/, "the working indicator should expose the animated iris loader");
assert.match(css, /@keyframes ab-spin/, "the loader should continuously rotate");
assert.match(css, /@keyframes ab-iris/, "the loader should animate its iris blades");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ab-loader/, "the loader should respect reduced-motion preferences");

console.log("5 branding checks passed");
