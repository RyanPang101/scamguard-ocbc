import type Anthropic from '@anthropic-ai/sdk';

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'allow_transaction',
    description:
      'Let the transaction proceed with no disruption. Use when activity looks normal for this customer.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why this is considered safe to allow.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'issue_warning',
    description:
      'Show the customer a contextual warning while letting the transaction proceed. Use for one or two mild anomalies.',
    input_schema: {
      type: 'object',
      properties: {
        message_to_grace: {
          type: 'string',
          description: 'ONE or two short, calm sentences for the customer (max ~30 words). No statistics or long caveats — just the concern, plainly.',
        },
        reason: { type: 'string', description: 'Why a warning (not a hold) is the right call.' },
      },
      required: ['message_to_grace', 'reason'],
    },
  },
  {
    name: 'request_verification',
    description:
      'Add a short verification step and pause before the transaction completes.',
    input_schema: {
      type: 'object',
      properties: {
        verification_prompt: {
          type: 'string',
          description: 'ONE short question asking the customer to confirm (max ~25 words).',
        },
        reason: { type: 'string' },
      },
      required: ['verification_prompt', 'reason'],
    },
  },
  {
    name: 'place_hold',
    description:
      'TEMPORARILY hold the transaction pending review. This is reversible and never a permanent freeze. Use for HIGH or CRITICAL risk.',
    input_schema: {
      type: 'object',
      properties: {
        message_to_grace: {
          type: 'string',
          description: 'ONE or two short, kind sentences on why the transfer is paused (max ~35 words). Elderly customers will not read a paragraph — be brief. No statistics or long caveats.',
        },
        reason: { type: 'string' },
      },
      required: ['message_to_grace', 'reason'],
    },
  },
  {
    name: 'alert_guardian',
    description:
      "Notify the customer's nominated Guardian Contact, per the customer's permissions. The Guardian Contact is informed only — they cannot approve or deny the transaction.",
    input_schema: {
      type: 'object',
      properties: {
        message_to_marcus: {
          type: 'string',
          description: 'Plain-language alert for the Guardian Contact.',
        },
        reason: { type: 'string' },
      },
      required: ['message_to_marcus', 'reason'],
    },
  },
  {
    name: 'escalate_to_specialist',
    description:
      'Route the case to a human fraud specialist for final review. Use for CRITICAL risk only.',
    input_schema: {
      type: 'object',
      properties: {
        case_summary: {
          type: 'string',
          description: 'Concise summary of the case for the human specialist.',
        },
        reason: { type: 'string' },
      },
      required: ['case_summary', 'reason'],
    },
  },
];

// AI second-opinion tool — used with forceTool so Claude MUST call it, same pattern as
// network.ts / care.ts. This gives an INDEPENDENT risk read over the raw signals; it is
// deliberately never shown the deterministic score, so it isn't anchored by it. The result
// can only ever RAISE the final score (see reasoningEngine.ts) — it is a second opinion,
// not a replacement for the deterministic rule table.
export const RISK_ASSESSMENT_TOOL: Anthropic.Tool = {
  name: 'assess_transfer_risk',
  description:
    "Give your own independent fraud-risk assessment of this transfer from the raw signals and matched " +
    "scam patterns provided. You are NOT told the deterministic score — form your own judgment.",
  input_schema: {
    type: 'object',
    properties: {
      ai_risk_score: {
        type: 'integer',
        description: '0-100. Your independent judgment of how risky this transfer is.',
      },
      ai_reasoning: {
        type: 'string',
        description: 'Why — cite the specific signal combination that drove your score, in plain language.',
      },
    },
    required: ['ai_risk_score', 'ai_reasoning'],
  },
};

export const RISK_ASSESSMENT_SYSTEM = `You are Guardian Angel's independent risk analyst. You are given a
list of raw fraud-risk signals observed for a transfer (each signal is a plain fact: e.g. "new recipient",
"OneToken reset", "recipient flagged by network check") and any scam-archetype patterns already matched
against them. You are deliberately NOT given any pre-computed numeric score, so your assessment is genuinely
independent, not anchored on someone else's number.

Weigh the signals and matched patterns as a fraud analyst would — some combinations are far more dangerous
together than any one signal alone (e.g. a device change plus a credential reset plus a large transfer is an
account-takeover signature, not three unrelated coincidences). Give your own 0-100 risk score and explain
your reasoning by naming the specific signals that drove it. Always call assess_transfer_risk.`;

export const SYSTEM_PROMPT = `You are Guardian Angel, an autonomous financial-care agent for OCBC, protecting
elderly banking customers from authorised-push-payment scams.

You RECOMMEND. You do not enforce. A deterministic risk score, risk level, and set of
permitted actions ("allowed_actions") are computed for you by a policy engine BEFORE you
reason, from the union of signals every defence layer has observed so far (caller
verification, recipient network checks, this transfer, and behavioural drift history).
You will be told the current risk_level and allowed_actions explicitly. Choose the
LEAST-RESTRICTIVE tool from allowed_actions that is still safe for this specific case —
reason over context, don't just pick the first option. If you believe a different
action is warranted, you may still call it; a separate policy engine will enforce the
final action and may clamp your recommendation back within the allowed envelope. You are
never the sole authority on which actions actually execute.

Core principles you must never violate:
- The customer remains in control of their own money. Interventions are warn, pause,
  hold temporarily, alert their nominated Guardian Contact, or hand off to a human
  specialist. Funds are NEVER permanently seized or frozen, and the Guardian Contact
  never gets authority over the customer's account.
- The Guardian Contact is a safety net who is informed, not a person who approves or
  denies the customer's transactions.
- You do not diagnose medical or cognitive conditions. You identify possible financial
  vulnerability, exploitation, confusion, or a major life change.

When you act, always produce a plain-language explanation a 68-year-old can
understand, free of jargon. Explain WHY you intervened, kindly and clearly.

You may recommend more than one tool for a single case (e.g. place_hold + alert_guardian
+ escalate_to_specialist for CRITICAL risk). Decide which tool(s) to recommend now.`;
