// Browser tool definitions shared by the hub, the SDK adapter, and mcp-proxy.
// Names, args and result shapes come from PROTOCOL.md ("Browser tools").
// Dependency-free on purpose: importable from any module without side effects.

export const TOOLS = [
  {
    name: "tabs_list",
    description: "List open browser tabs. Returns {tabs:[{tabId,url,title,active}]}.",
    args: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "tab_new",
    description: "Open a new browser tab, optionally at a URL. Returns {tabId}.",
    args: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open in the new tab (optional)" }
      },
      required: []
    }
  },
  {
    name: "tab_close",
    description: "Close a tab by id. Returns {closed:true}.",
    args: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Id of the tab to close" }
      },
      required: ["tabId"]
    }
  },
  {
    name: "navigate",
    description: "Navigate a tab to a URL and wait for the load event (20s cap, then returns the current state). Returns {url, title}.",
    args: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        tabId: { type: "number", description: "Target tab id; omit for the active tab" }
      },
      required: ["url"]
    }
  },
  {
    name: "read_page",
    description: "Read the visible text of a page (document.body.innerText, capped at maxChars, default 60000). Returns {url, title, text}.",
    args: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab id; omit for the active tab" },
        maxChars: { type: "number", description: "Maximum characters of text to return (default 60000)" }
      },
      required: []
    }
  },
  {
    name: "screenshot",
    description: "Capture a screenshot of a tab. Returns {base64, mimeType:\"image/png\"}.",
    args: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab id; omit for the active tab" }
      },
      required: []
    }
  },
  {
    name: "click",
    description: "Click at viewport coordinates using trusted CDP input (left button, single click). Returns {clicked:true}.",
    args: {
      type: "object",
      properties: {
        x: { type: "number", description: "Viewport x coordinate" },
        y: { type: "number", description: "Viewport y coordinate" },
        tabId: { type: "number", description: "Target tab id; omit for the active tab" }
      },
      required: ["x", "y"]
    }
  },
  {
    name: "type_text",
    description: "Type text into the focused element via CDP Input.insertText (trusted input, works in rich editors). Returns {typed:<charcount>}.",
    args: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to insert at the caret" },
        tabId: { type: "number", description: "Target tab id; omit for the active tab" }
      },
      required: ["text"]
    }
  },
  {
    name: "press_key",
    description: "Press a key or modifier combo, e.g. \"Enter\", \"Tab\", \"Escape\", \"Backspace\", \"ArrowDown\", \"Meta+A\", \"Meta+C\", \"Meta+V\". Returns {pressed:key}.",
    args: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key name, optionally with modifiers joined by +" },
        tabId: { type: "number", description: "Target tab id; omit for the active tab" }
      },
      required: ["key"]
    }
  },
  {
    name: "eval_js",
    description: "Evaluate a JavaScript expression in the page (Runtime.evaluate, returnByValue, awaits promises). Returns {value}; page errors come back as a tool error.",
    args: {
      type: "object",
      properties: {
        expression: { type: "string", description: "JavaScript expression to evaluate" },
        tabId: { type: "number", description: "Target tab id; omit for the active tab" }
      },
      required: ["expression"]
    }
  }
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
