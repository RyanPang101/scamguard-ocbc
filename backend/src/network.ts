import type Anthropic from '@anthropic-ai/sdk';
import { reason } from './reason.js';
import { setLayerSignals } from './riskContext.js';
import type { ToolCall } from './types.js';

/*
  Feature 2 — Privacy-Preserving Interbank Scam Intelligence Network.

  HONESTY BOUNDARY (read before the demo):
  - There is NO live interbank fraud consortium API available to a hackathon team, so the
    "shared network graph" below is a DETERMINISTIC SIMULATION. It is labelled
    `source: 'simulated'` in every payload and surfaced in the UI as
    "Simulated interbank signal (demo scope)". We never claim it is live consortium data.
  - There IS one genuinely REAL external signal: an optional email-breach lookup against
    XposedOrNot's free, keyless public API (https://api.xposedornot.com). When the operator
    supplies a contact email for the recipient, we make a real HTTP call and use the real
    breach count as a fraud-exposure signal. It is labelled `source: 'real_api'`.
  - Both signal sets are fed to the live Claude call, which produces the final network-risk
    verdict and plain-language explanation. The verdict routes through the model.
*/

export interface NetworkSignal {
  source: 'real_api' | 'simulated';
  label: string;
  detail: string;
  severity: 'info' | 'low' | 'medium' | 'high';
}

// ---- REAL external signal: XposedOrNot breach analytics (keyless, free) ----
async function fetchBreachSignal(email: string): Promise<NetworkSignal | null> {
  try {
    const res = await fetch(
      `https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) {
      // 404 = not found in any breach, which is itself a (reassuring) real signal.
      if (res.status === 404) {
        return {
          source: 'real_api',
          label: 'Email breach check (XposedOrNot, live)',
          detail: `Recipient contact email not found in any known data breach.`,
          severity: 'info',
        };
      }
      return null;
    }
    const data: unknown = await res.json();
    const breaches =
      (data as { ExposedBreaches?: { breaches_details?: unknown[] } })?.ExposedBreaches
        ?.breaches_details ?? [];
    const count = Array.isArray(breaches) ? breaches.length : 0;
    return {
      source: 'real_api',
      label: 'Email breach check (XposedOrNot, live)',
      detail:
        count > 0
          ? `Recipient contact email appears in ${count} known data breach${count === 1 ? '' : 'es'} — credentials may be compromised or the identity reused by scammers.`
          : `Recipient contact email has no recorded breaches.`,
      severity: count >= 5 ? 'high' : count >= 1 ? 'medium' : 'info',
    };
  } catch {
    return null; // Network unreachable (offline demo) — degrade honestly, no fake data.
  }
}

// ---- SIMULATED interbank consortium graph (deterministic, clearly labelled) ----
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ConsortiumGraph {
  source: 'simulated';
  mule_score: number; // 0-100
  linked_senders: number; // unrelated senders paying this account recently
  banks_involved: number;
  rapid_outflow_pct: number; // % of inbound funds moved out within 10 min
  shared_device_flags: number; // device fingerprints seen across multiple banks
}

export function buildConsortiumGraph(recipientKey: string, recipientIsNew: boolean): ConsortiumGraph {
  const h = hash(recipientKey.toLowerCase().trim());
  // Deterministic pseudo-metrics so the same payee always yields the same graph on stage.
  const linked_senders = recipientIsNew ? 4 + (h % 22) : h % 3;
  const banks_involved = recipientIsNew ? 2 + (h % 4) : 1;
  const rapid_outflow_pct = recipientIsNew ? 60 + (h % 39) : h % 20;
  const shared_device_flags = recipientIsNew ? (h >> 3) % 5 : 0;
  const mule_score = Math.min(
    100,
    Math.round(
      linked_senders * 2.2 + banks_involved * 6 + rapid_outflow_pct * 0.35 + shared_device_flags * 7,
    ),
  );
  return {
    source: 'simulated',
    mule_score,
    linked_senders,
    banks_involved,
    rapid_outflow_pct,
    shared_device_flags,
  };
}

function graphToSignals(g: ConsortiumGraph): NetworkSignal[] {
  const sev = (n: number, med: number, high: number): NetworkSignal['severity'] =>
    n >= high ? 'high' : n >= med ? 'medium' : n > 0 ? 'low' : 'info';
  return [
    {
      source: 'simulated',
      label: 'Unrelated senders → this account (30d)',
      detail: `${g.linked_senders} unrelated customers across ${g.banks_involved} bank${g.banks_involved === 1 ? '' : 's'} recently paid this recipient.`,
      severity: sev(g.linked_senders, 3, 8),
    },
    {
      source: 'simulated',
      label: 'Rapid fund dispersal',
      detail: `${g.rapid_outflow_pct}% of funds received are moved out again within minutes — a mule-account pattern.`,
      severity: sev(g.rapid_outflow_pct, 40, 70),
    },
    {
      source: 'simulated',
      label: 'Shared device fingerprints across banks',
      detail:
        g.shared_device_flags > 0
          ? `${g.shared_device_flags} device fingerprint(s) tied to this account were seen operating other flagged accounts at different banks.`
          : `No shared device fingerprints detected.`,
      severity: sev(g.shared_device_flags, 1, 3),
    },
  ];
}

const NETWORK_TOOL: Anthropic.Tool = {
  name: 'assess_recipient_network',
  description:
    'Return the final recipient network-risk verdict after weighing the provided real and simulated signals.',
  input_schema: {
    type: 'object',
    properties: {
      network_risk: { type: 'string', enum: ['clear', 'caution', 'high_risk'] },
      confidence: { type: 'integer', description: '0-100 confidence in this verdict.' },
      recommended_action: {
        type: 'string',
        enum: ['proceed', 'proceed_with_warning', 'add_verification', 'block_and_review'],
      },
      explanation_to_grace: {
        type: 'string',
        description:
          'ONE short, calm sentence a 68-year-old will actually read (max ~20 words). Say the concern plainly. Do NOT list statistics, percentages, counts, or caveats here — those go in key_signals. Example: "This account shows signs of a scam collection account, so please double-check who you\'re paying."',
      },
      key_signals: {
        type: 'array',
        items: { type: 'string' },
        description:
          '2–3 very short plain-language bullet points (max ~8 words each) with the specifics — e.g. "Many strangers pay this account", "Money leaves within minutes".',
      },
    },
    required: ['network_risk', 'confidence', 'recommended_action', 'explanation_to_grace', 'key_signals'],
  },
};

const NETWORK_SYSTEM = `You are Guardian Angel's recipient-network analyst for OCBC. Before a transfer
completes, you receive fraud-network signals about the RECIPIENT account and decide the network-risk
verdict. You are told explicitly which signals are from a REAL external API and which are a SIMULATED
interbank consortium graph (demo scope). Weigh them proportionately and never overstate certainty of
simulated data. Choose the least-restrictive safe recommendation. The customer keeps final authority.
BREVITY IS CRITICAL: explanation_to_grace must be ONE short sentence — elderly customers do not read
long warnings, and a wall of text defeats the purpose. Put specifics in short key_signals bullets, not
in the sentence. Always call assess_recipient_network.`;

export interface NetworkCheckResult {
  id: string;
  recipient_name: string;
  amount: number;
  signals: NetworkSignal[];
  consortium: ConsortiumGraph;
  real_signal_present: boolean;
  network_risk: string;
  confidence: number;
  recommended_action: string;
  explanation_to_grace: string;
  key_signals: string[];
  source: 'live' | 'cached_fallback';
  timestamp: number;
}

function cachedNetworkVerdict(
  recipientName: string,
  signals: NetworkSignal[],
  g: ConsortiumGraph,
): { tool_calls: ToolCall[]; model_raw_text: string } {
  const high = g.mule_score >= 55;
  const med = g.mule_score >= 30;
  const risk = high ? 'high_risk' : med ? 'caution' : 'clear';
  const action = high ? 'block_and_review' : med ? 'add_verification' : 'proceed';
  const explanation = high
    ? `${recipientName} shows signs of a scam collection account. Please pause and check who they are.`
    : med
      ? `${recipientName} looks a little unusual. Please confirm you know this person before sending.`
      : `${recipientName} looks clear — nothing matches known scam patterns.`;
  return {
    tool_calls: [
      {
        tool: 'assess_recipient_network',
        input: {
          network_risk: risk,
          confidence: high ? 82 : med ? 61 : 74,
          recommended_action: action,
          explanation_to_grace: explanation,
          key_signals: signals.filter((s) => s.severity === 'high' || s.severity === 'medium').map((s) => s.label),
        },
      },
    ],
    model_raw_text: `Consortium mule-score for ${recipientName} is ${g.mule_score}/100 (simulated). Verdict: ${risk}.`,
  };
}

export async function runNetworkCheck(opts: {
  recipientName: string;
  recipientAcct: string;
  recipientIsNew: boolean;
  amount: number;
  contactEmail?: string;
  forceDemo: boolean;
}): Promise<NetworkCheckResult> {
  const key = `${opts.recipientName}|${opts.recipientAcct}`;
  const consortium = buildConsortiumGraph(key, opts.recipientIsNew);
  const signals: NetworkSignal[] = graphToSignals(consortium);

  let real_signal_present = false;
  if (opts.contactEmail && opts.contactEmail.includes('@')) {
    const breach = await fetchBreachSignal(opts.contactEmail);
    if (breach) {
      signals.unshift(breach);
      real_signal_present = true;
    }
  }

  const cached = cachedNetworkVerdict(opts.recipientName, signals, consortium);
  const userContent = `Recipient: ${opts.recipientName} (${opts.recipientAcct}), new payee: ${opts.recipientIsNew}. Transfer amount: S$${opts.amount.toLocaleString()}.

Signals (each tagged by source — real_api = genuine live external data, simulated = demo-scope interbank graph):
${JSON.stringify(signals, null, 2)}

Simulated consortium summary: ${JSON.stringify(consortium)}

Weigh these and call assess_recipient_network.`;

  const { tool_calls, model_raw_text, source } = await reason({
    system: NETWORK_SYSTEM,
    tools: [NETWORK_TOOL],
    userContent,
    cached,
    forceDemo: opts.forceDemo,
    forceTool: 'assess_recipient_network',
    maxTokens: 700,
  });

  const input = (tool_calls[0]?.input ?? {}) as Record<string, unknown>;
  const asStr = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  const asNum = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  // A mule recipient is risky regardless of amount, but the SEVERITY the transfer inherits
  // scales with exposure — sending S$10 to an unknown account shouldn't push the session to
  // HIGH the way sending S$10,000 does. This keeps arbitrary judge inputs coherent.
  const networkRisk = asStr(input.network_risk, 'caution');
  // Scoped to THIS recipient (acct, falling back to name) — a flag on one payee must never
  // bleed into a later, unrelated transfer just because both happened in the same session.
  const subject = opts.recipientAcct || opts.recipientName;
  if (networkRisk === 'clear') {
    setLayerSignals('network', []);
  } else {
    const material = opts.amount >= 1000;
    setLayerSignals('network', [
      {
        category: 'recipient_network',
        label: 'Recipient network risk',
        detail: `Recipient network check flagged ${opts.recipientName} as ${networkRisk} (simulated mule-score ${consortium.mule_score}/100).`,
        severity: networkRisk === 'high_risk' && material ? 'high' : material ? 'medium' : 'low',
        subject,
      },
    ]);
  }

  return {
    id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    recipient_name: opts.recipientName,
    amount: opts.amount,
    signals,
    consortium,
    real_signal_present,
    network_risk: asStr(input.network_risk, 'caution'),
    confidence: asNum(input.confidence, 60),
    recommended_action: asStr(input.recommended_action, 'add_verification'),
    explanation_to_grace: asStr(input.explanation_to_grace, model_raw_text),
    key_signals: asArr(input.key_signals),
    source,
    timestamp: Date.now(),
  };
}
