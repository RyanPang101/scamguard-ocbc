import Anthropic from '@anthropic-ai/sdk';
import type { ToolCall, ToolName } from './types.js';

/*
  Guardian Angel — shared reasoning engine.

  Every defence layer (transfer interception, recipient-network check, adaptive care)
  routes its FINAL decision through this one function. It performs a real Anthropic
  tool-use call, races it against a timeout, and — only if the live call errors or is
  not configured — falls back to a caller-supplied cached response.

  The `source` field ('live' | 'cached_fallback') is returned untouched all the way to
  the UI so a judge can always see which engine produced a given result. The fallback is
  never dressed up as live AI.
*/

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export const MODEL = 'claude-sonnet-5';
// claude-sonnet-5 runs adaptive thinking ON BY DEFAULT. These calls are bounded,
// forced-single-tool decisions (allow/warn/hold/etc, or a network/care verdict) — the
// deterministic risk engine already did the hard reasoning, so extended internal
// thinking adds latency without adding value here. Disabling it keeps every
// judge-facing interaction fast and reliable; 20s is a generous safety margin on top.
const LIVE_TIMEOUT_MS = 25000;

export function hasLiveKey(): boolean {
  return anthropic !== null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface ReasonResult {
  tool_calls: ToolCall[];
  model_raw_text: string;
  source: 'live' | 'cached_fallback';
}

export interface CachedReason {
  tool_calls: ToolCall[];
  model_raw_text: string;
}

export interface ReasonRequest {
  system: string;
  tools: Anthropic.Tool[];
  userContent: string;
  cached: CachedReason;
  /** When true, skip the live call entirely and return the cached response (Demo mode). */
  forceDemo: boolean;
  /** Force the model to call exactly this tool (used for single-verdict layers). */
  forceTool?: string;
  maxTokens?: number;
}

async function callModel(req: ReasonRequest): Promise<{ tool_calls: ToolCall[]; model_raw_text: string }> {
  if (!anthropic) throw new Error('no api key configured');

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: req.maxTokens ?? 1024,
    system: req.system,
    tools: req.tools,
    thinking: { type: 'disabled' },
    ...(req.forceTool ? { tool_choice: { type: 'tool' as const, name: req.forceTool } } : {}),
    messages: [{ role: 'user', content: req.userContent }],
  });

  const tool_calls: ToolCall[] = [];
  let model_raw_text = '';
  for (const block of message.content) {
    if (block.type === 'text') model_raw_text += block.text;
    else if (block.type === 'tool_use') {
      tool_calls.push({ tool: block.name as ToolName, input: block.input as Record<string, unknown> });
    }
  }
  if (tool_calls.length === 0) throw new Error('model returned no tool calls');
  return { tool_calls, model_raw_text };
}

export async function reason(req: ReasonRequest): Promise<ReasonResult> {
  if (req.forceDemo || !anthropic) {
    return { ...req.cached, source: 'cached_fallback' };
  }
  try {
    const live = await withTimeout(callModel(req), LIVE_TIMEOUT_MS);
    return { ...live, source: 'live' };
  } catch (err) {
    // Never silently swallow this — if the live call is failing (bad key, no credits,
    // rate limit, wrong model, network), the terminal is the only place that says why.
    // Without this log, a misconfigured key just looks identical to Demo mode forever.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reason] live Claude call failed, falling back to cached response: ${msg}`);
    return { ...req.cached, source: 'cached_fallback' };
  }
}
