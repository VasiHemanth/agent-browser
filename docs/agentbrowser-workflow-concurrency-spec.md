# Spec: visible browser workflows and safe concurrent harnesses

## Objective

Make AgentBrowser feel like the browser-control workspace, not a separate chat
box. The composer should be compact and intentional at every side-panel width.
Every browser action taken from AgentBrowser chat **or an external MCP harness
such as Codex** should appear as an expandable run with its tool, target tab,
outcome, and any screenshot that was explicitly captured.

Independent coding harnesses may use one installed AgentBrowser extension at
the same time, but no external harness may silently mutate an arbitrary active
tab or interleave a click/key sequence with another harness on the same tab.

## Current state

- The side panel already collapses an AgentBrowser chat turn into `Worked for
  Ns, X steps`; expanding it reveals thinking/status and tool chips.
- `/parallel` already runs one lane per tagged tab, capped at six lanes.
- Any number of MCP harness sockets can connect to the hub, but their calls are
  not visible in the panel and overlapping same-tab actions are unsafe.
- Screenshot bytes reach the calling model, but the panel receives only a text
  summary and cannot show an image.

## Success criteria

1. The empty composer is content-sized, visually bounded, and remains usable
   at 240, 320, 360, and 480 px panel widths with no horizontal page scroll.
2. A user can expand any completed AgentBrowser chat run to see an ordered
   timeline of status, thinking text supplied by the selected adapter, tools,
   results, target tabs, and screenshot thumbnails.
3. A Codex/MCP action appears in a separate, expandable external-workflow card
   with source name, elapsed time, target tab, and success/failure state.
4. Screenshot thumbnails are displayed only for an explicit `screenshot` tool
   call; page text, typed content, and JavaScript expressions are never copied
   into the activity feed by default.
5. Two harnesses can perform operations on different explicitly named tabs in
   parallel. Mutating calls without a `tabId` are rejected for external
   harnesses, and same-tab composite actions execute atomically in order.
6. Each external request is internally routed by a server-generated ID, so two
   clients reusing the same request ID cannot receive one another’s results.
7. Existing chat behavior, adapters, and `/parallel` lanes remain compatible.

## Tech stack and commands

- Manifest V3 extension: `extension/manifest.json`, `sw.js`, `cdp.js`, and the
  side panel’s plain HTML/CSS/ES modules.
- Local Node 20.11+ WebSocket hub: `server/hub.mjs`.
- MCP stdio bridge: `server/mcp-proxy.mjs`.

```bash
# Extension suites
node --test extension/branding.test.mjs extension/markdown.test.mjs extension/overlay.test.mjs extension/sidepanel.test.mjs extension/sidepanel.dom.test.mjs

# Server suites
npm --prefix server test
npm --prefix server run test:e2e

# Regenerate manifest PNGs after brand-geometry changes
node extension/icons/make-icons.mjs
```

## Design

### Composer

Keep the existing footer-card model, but give it three bounded areas:

1. A horizontally scrolling context rail for the current tab, tagged tabs, and
   attachments. It must not grow taller for many tabs.
2. A labelled, 48–128 px textarea.
3. A stable toolbar: attach/microphone on the left and one Send-or-Stop action
   slot on the right. There is no cosmetic search-mode control unless it maps
   to an actual AgentBrowser command.

### Run timeline

Use the existing collapsed work-block/lane-card interaction, but generalize it
to a run card keyed by `workflowId`. A card header shows source, state,
duration, and step count. Its body holds ordered tool rows and optional
screenshot artifacts. Screenshot images use per-card Blob URLs; URLs are
revoked when the card is cleared. A screenshot opens from its accessible
thumbnail; it is never injected as an unbounded data URI.

The panel shows execution facts, not private model reasoning. Adapter-supplied
`thinking` events may remain visible in the adapter’s own chat run. An external
MCP client receives a tool timeline only unless it intentionally publishes a
separate progress event in a later protocol version.

### Additive activity contract

Preserve `chat_event`. Add hub-to-extension-to-panel events:

```js
{
  type: "workflow_event",
  workflowId: "<server-generated>",
  source: { kind: "chat" | "harness", name: "Codex" },
  event: {
    kind: "started" | "tool_started" | "tool_finished" | "finished",
    callId: "<server-generated>",
    tool: "screenshot",
    args: { tabId: 42 },
    tab: { tabId: 42, title: "Example Domain" },
    ok: true,
    summary: "captured 1440×900",
    artifact: { kind: "screenshot", mimeType: "image/png", base64: "..." }
  }
}
```

Only screenshot events may carry an artifact. All other results are reduced to
the existing compact summary. The hub must emit a terminal event for success,
failure, timeout, and no-extension cases.

### Safe concurrency

The hub creates a `clientId`, `workflowId`, and `routeId` for every harness
connection/dispatch. The global pending map keys on `routeId`, never on a
client-provided MCP request ID. It restores the caller’s request ID only when
replying to that caller.

External mutating calls (`navigate`, `click`, `type_text`, `press_key`, and
`eval_js`) require an explicit tab ID. The extension resolves and records the
target tab once, then runs the entire operation through a per-tab operation
queue: mouse down/up, key down/up, and navigation/load cannot interleave on the
same tab. Different tabs may run simultaneously, subject to a bounded
global/per-client scheduler.

### Optional named tab groups — approval gate

After the safety layer is verified, add explicit workflow grouping:

- `workflow_begin` creates a named Chrome tab group for a harness run.
- New research tabs join that group; fan-out work opens one tab per query.
- `workflow_end` marks the timeline complete but leaves tabs open for review.

This requires adding the `tabGroups` permission to the manifest. Chrome
documents that `chrome.tabGroups` requires this permission and works with
`chrome.tabs` to group/query tabs. The permission changes what users approve,
so it must not ship until approved.

## Implementation plan

### Phase 1 — composer and existing-chat visibility

1. Restructure the composer into context rail, labelled input, and stable
   toolbar; update responsive CSS and DOM tests.
2. Upgrade existing chat work blocks into a readable ordered execution
   timeline. Add screenshot artifacts for adapter chat calls, with bounds and
   cleanup.

Checkpoint: side-panel DOM tests pass; visual verification confirms a
content-sized composer and an expanded chat run with a screenshot.

### Phase 2 — external Codex workflow timeline

3. Define and relay `workflow_event` through hub, service worker, and panel.
4. Instrument MCP-proxy harness dispatches with generated routing/workflow
   IDs; render their cards beside chat turns without mixing runs.

Checkpoint: two fake harnesses produce independently expandable timelines;
screenshot artifacts display without exposing unrelated page data.

### Phase 3 — safe multi-harness browser control

5. Replace caller-ID keyed pending entries with generated route IDs and add a
bounded scheduler.
6. Enforce explicit tab targets for external mutations and make per-tab
operations atomic while preserving different-tab parallelism.

Checkpoint: duplicate caller IDs route correctly; same-tab key/click sequences
do not interleave; different-tab workflows overlap.

### Phase 4 — optional named Chrome tab groups

7. After permission approval, add workflow begin/end tools, Chrome group
creation, and group membership display in the side panel.

Checkpoint: a multi-search workflow opens grouped tabs, runs up to six in
parallel, and leaves the group intact for review.

## Testing strategy

- `extension/sidepanel.dom.test.mjs`: composer sizing state, Send/Stop swap,
  expanded workflow cards, out-of-order results, and artifact cleanup.
- `server/hub-e2e.test.mjs`: concurrent harness routing, duplicate caller IDs,
  failures/timeouts, and workflow-event ordering.
- CDP/service-worker tests: same-tab atomicity, different-tab overlap, and
  rejected implicit-target mutations.
- Real Chrome verification: reload the unpacked extension, use two Codex
  tasks against distinct tabs, expand both timelines, and inspect a captured
  screenshot.

## Boundaries

- Always: keep browser facts scoped to the run; use compact summaries; test
  every protocol path; preserve existing `chat_event` compatibility.
- Ask first: add `tabGroups` permission; auto-capture screenshots beyond
  explicit screenshot calls; send any page text or typed content to the panel
  activity feed.
- Never: expose cookies, local storage, tokens, or unredacted browser content
  in workflow cards; allow external mutation with an implicit active tab.

## Open questions

1. Approve the `tabGroups` manifest permission for named research groups?
2. Should a Codex run be grouped automatically by MCP connection, or should
   Codex call explicit `workflow_begin`/`workflow_end` tools? The recommended
   default is automatic grouping by connection with an explicit naming tool.
3. Is a screenshot only after explicit `screenshot` calls the desired privacy
   default, or should the extension capture one after selected mutations?
