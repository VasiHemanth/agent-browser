// Model pricing for the PROTOCOL v1.3 meta event (PROTOCOL.md "Usage / tokens").
//
// Two exports do the work:
//   PRICES   model id -> {inputPerMTok, outputPerMTok, cacheReadPerMTok?, cacheWritePerMTok?}
//   costFor  (model, usage[, adapterName]) -> number | null   USD for one turn
//
// costFor returns null whenever we cannot honestly price the turn: unknown
// model, no usage numbers, or an adapter the user is not billed per token for.
// A wrong dollar figure is worse than none, so every uncertain path is null.

// Anthropic's published prompt-cache multipliers, relative to the model's base
// input rate: a cache read costs 0.1x, a 5-minute cache write 1.25x. (A 1-hour
// write is 2x; the adapters here never request the 1h TTL, so 1.25x is the rate
// that applies.) Deriving the cache rates keeps them correct when a base rate
// changes instead of drifting out of sync with a hand-copied number.
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

function round(n) {
  // Rates are dollars per million tokens; 4 decimals is well under a cent per
  // MTok and avoids float noise like 0.30000000000000004.
  return Math.round(n * 10000) / 10000;
}

// Anthropic rates: input/output USD per million tokens, cache rates derived.
function anthropic(inputPerMTok, outputPerMTok) {
  return {
    inputPerMTok,
    outputPerMTok,
    cacheReadPerMTok: round(inputPerMTok * CACHE_READ_MULTIPLIER),
    cacheWritePerMTok: round(inputPerMTok * CACHE_WRITE_MULTIPLIER)
  };
}

export const PRICES = {
  // --- Anthropic API rates (current) ---------------------------------------
  'claude-fable-5': anthropic(10, 50),
  'claude-opus-5': anthropic(5, 25),
  'claude-opus-4-8': anthropic(5, 25),
  'claude-opus-4-7': anthropic(5, 25),
  'claude-opus-4-6': anthropic(5, 25),
  // Introductory pricing, active through 2026-08-31. Revert to
  // anthropic(3, 15) — the standard rate — once that date passes.
  'claude-sonnet-5': anthropic(2, 10),
  'claude-sonnet-4-6': anthropic(3, 15),
  'claude-haiku-4-5': anthropic(1, 5),

  // --- OpenAI: ESTIMATES, UNVERIFIED ---------------------------------------
  // These two entries are guesses, not published rates we have checked. They
  // exist so an openai-api turn shows *some* figure rather than nothing, and
  // they are the first thing to correct if a cost looks wrong. Do not treat a
  // number derived from these as a bill. Verify against OpenAI's pricing page
  // before relying on either.
  'gpt-5.6': { inputPerMTok: 1.25, outputPerMTok: 10, estimate: true },
  o4: { inputPerMTok: 15, outputPerMTok: 60, estimate: true }
};

// Adapters where the user pays per token, so a dollar figure is real.
//
// Only the two BYO-key API adapters qualify: the user pasted their own key into
// the keystore and every token is billed to it.
//
// Everything else defaults to false, deliberately:
//   claude-cli, codex, copilot, grok, agy  run on the user's own flat plan.
//   gemini                                 runs on a Google account / free tier.
//   claude-agent-sdk                       spawns the bundled Claude Code cli.js,
//                                          which authenticates with the user's
//                                          Claude Code login on this machine —
//                                          a flat plan, not per-token billing.
//                                          Flip this to true only if the SDK is
//                                          ever wired to a keystore API key.
// Showing a cost to someone on a flat plan invents a charge that does not
// exist, so an adapter we are not certain about stays false.
const METERED = {
  'anthropic-api': true,
  'openai-api': true
};

export function isMetered(adapterName) {
  return METERED[adapterName] === true;
}

// The panel/hub may hand us a model string with a provider prefix (Bedrock's
// "anthropic.claude-opus-5") or a date-suffixed snapshot
// ("claude-haiku-4-5-20251001"). Both price the same as the base id.
function normalizeModel(model) {
  if (typeof model !== 'string') return null;
  let id = model.trim().toLowerCase();
  if (!id) return null;
  if (PRICES[id]) return id;
  id = id.replace(/^anthropic\./, '');
  if (PRICES[id]) return id;
  const undated = id.replace(/-\d{8}$/, '');
  if (PRICES[undated]) return undated;
  return null;
}

export function priceFor(model) {
  const id = normalizeModel(model);
  return id ? PRICES[id] : null;
}

// True when this model's rates are our guess rather than a published, checked
// figure. The panel renders those with a "~" so an estimate never reads as a
// billed amount. Non-metered adapters have no cost at all, so false there.
export function isEstimatedCost(model, adapterName) {
  if (adapterName !== undefined && adapterName !== null && !isMetered(adapterName)) {
    return false;
  }
  const price = priceFor(model);
  return Boolean(price && price.estimate);
}

function tokens(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

// costFor(model, usage) -> USD for this turn, or null when unpriceable.
//
// usage uses the meta-event field names:
//   {inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}
// Any of them may be null/undefined. Anthropic reports input_tokens exclusive
// of the cached buckets, so the three input-side numbers are summed, not
// overlapped.
//
// adapterName is optional. When given, a non-metered adapter returns null —
// the tokens are real but the user is not billed for them.
export function costFor(model, usage, adapterName) {
  if (adapterName !== undefined && adapterName !== null && !isMetered(adapterName)) {
    return null;
  }
  const price = priceFor(model);
  if (!price) return null;
  const u = usage && typeof usage === 'object' ? usage : {};

  const input = tokens(u.inputTokens);
  const output = tokens(u.outputTokens);
  const cacheRead = tokens(u.cacheReadTokens);
  const cacheWrite = tokens(u.cacheWriteTokens);
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) {
    // Nothing was reported (all nulls). Zero would read as "this turn was
    // free", which is a different claim from "we do not know".
    return null;
  }

  const readRate = typeof price.cacheReadPerMTok === 'number'
    ? price.cacheReadPerMTok
    : price.inputPerMTok;
  const writeRate = typeof price.cacheWritePerMTok === 'number'
    ? price.cacheWritePerMTok
    : price.inputPerMTok;

  const usd = (input * price.inputPerMTok
    + output * price.outputPerMTok
    + cacheRead * readRate
    + cacheWrite * writeRate) / 1e6;

  // Sub-cent turns are normal, so keep 6 decimals rather than rounding to 0.
  return Math.round(usd * 1e6) / 1e6;
}
