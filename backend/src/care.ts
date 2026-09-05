import type Anthropic from '@anthropic-ai/sdk';
import { reason } from './reason.js';
import { setLayerSignals } from './riskContext.js';
import type { ToolCall } from './types.js';

/*
  Feature 4 — Adaptive Financial Care and Scam Interception.

  Unlike the single-transaction interceptor (Feature 3), this layer reasons over WEEKS of
  behaviour to detect sustained drift: escalating payments to one new recipient, savings
  liquidation, and repeated dismissal of warnings.

  HONESTY BOUNDARY: the transaction history is a SYNTHETIC DEMO DATASET generated below and
  labelled `dataset: 'synthetic-demo'`. It is never presented as live account data. The
  ANALYSIS of that history is a real Claude call that returns one of five escalation levels
  with reasoning. The verdict routes through the model.
*/

export interface CareEvent {
  day: number; // days ago (0 = today)
  date: string;
  type: 'payment' | 'warning_dismissed' | 'savings_liquidation' | 'login' | 'limit_increase';
  recipient?: string;
  amount?: number;
  note: string;
}

export type CareScenario = 'grooming' | 'stable';

// Deterministic synthetic history — same every run so the stage demo is reliable.
export function generateHistory(scenario: CareScenario): { dataset: 'synthetic-demo'; events: CareEvent[] } {
  const today = Date.now();
  const dstr = (daysAgo: number) =>
    new Date(today - daysAgo * 86_400_000).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' });
  const events: CareEvent[] = [];
  const push = (day: number, e: Omit<CareEvent, 'day' | 'date'>) =>
    events.push({ day, date: dstr(day), ...e });

  if (scenario === 'stable') {
    // Normal life: groceries, utilities, small helper transfers, son.
    push(2, { type: 'payment', recipient: 'NTUC FairPrice', amount: 48.3, note: 'Groceries' });
    push(5, { type: 'payment', recipient: 'SP Group', amount: 132.0, note: 'Utilities (GIRO)' });
    push(9, { type: 'payment', recipient: 'Mei Ling (Helper)', amount: 800, note: 'Monthly helper pay' });
    push(14, { type: 'payment', recipient: 'Marcus Tan (Son)', amount: 200, note: 'Dinner share' });
    push(21, { type: 'payment', recipient: 'Tan Clinic', amount: 90, note: 'Check-up' });
    push(28, { type: 'payment', recipient: 'SP Group', amount: 128.4, note: 'Utilities (GIRO)' });
    return { dataset: 'synthetic-demo', events: events.sort((a, b) => a.day - b.day) };
  }

  // Grooming: escalating payments to a new "Officer Lim", savings drawn down, warnings ignored.
  push(30, { type: 'payment', recipient: 'SP Group', amount: 131.0, note: 'Utilities — normal baseline' });
  push(26, { type: 'login', note: 'New device login (unrecognised Android)' });
  push(25, { type: 'payment', recipient: 'David Lim', amount: 500, note: 'First payment to new recipient' });
  push(22, { type: 'warning_dismissed', recipient: 'David Lim', note: 'Dismissed Guardian Angel new-payee caution' });
  push(20, { type: 'payment', recipient: 'David Lim', amount: 1200, note: 'Second, larger payment' });
  push(16, { type: 'limit_increase', note: 'Daily transfer limit raised S$5k → S$25k' });
  push(15, { type: 'payment', recipient: 'David Lim', amount: 3000, note: 'Third payment — escalating' });
  push(12, { type: 'warning_dismissed', recipient: 'David Lim', note: 'Dismissed caution a second time' });
  push(9, { type: 'savings_liquidation', amount: 40000, note: 'Fixed deposit broken early' });
  push(8, { type: 'payment', recipient: 'David Lim', amount: 8000, note: 'Fourth payment after liquidation' });
  push(3, { type: 'warning_dismissed', recipient: 'David Lim', note: 'Dismissed caution a third time' });
  push(1, { type: 'payment', recipient: 'David Lim', amount: 15000, note: 'Largest payment yet' });
  return { dataset: 'synthetic-demo', events: events.sort((a, b) => a.day - b.day) };
}

// The five escalation levels from the spec, least → most restrictive.
export const CARE_LEVELS = [
  { level: 1, key: 'clearer_info', label: 'Clearer information' },
  { level: 2, key: 'contextual_questions', label: 'Contextual questions' },
  { level: 3, key: 'cooling_off', label: 'Cooling-off period' },
  { level: 4, key: 'guardian_alert', label: 'Guardian Contact alert' },
  { level: 5, key: 'human_support', label: 'Human SeniorCare support' },
] as const;

const CARE_TOOL: Anthropic.Tool = {
  name: 'assess_financial_care',
  description:
    'Return the adaptive financial-care verdict after analysing WEEKS of behaviour for sustained drift.',
  input_schema: {
    type: 'object',
    properties: {
      drift_detected: { type: 'boolean' },
      escalation_level: {
        type: 'integer',
        description:
          '1=clearer information, 2=contextual questions, 3=cooling-off period, 4=Guardian Contact alert, 5=human SeniorCare support. Choose the LEAST restrictive level that is still safe.',
      },
      pattern_summary: { type: 'string', description: 'What sustained pattern (if any) was detected.' },
      contextual_questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Gentle questions to ask the customer (used at level 2+).',
      },
      message_to_grace: { type: 'string', description: 'Plain-language, kind message for the customer.' },
      message_to_guardian: {
        type: 'string',
        description: 'Message for the Guardian Contact if level >= 4, else empty string.',
      },
    },
    required: ['drift_detected', 'escalation_level', 'pattern_summary', 'contextual_questions', 'message_to_grace', 'message_to_guardian'],
  },
};

const CARE_SYSTEM = `You are Guardian Angel's Adaptive Financial Care agent for OCBC. You are given WEEKS
of a customer's transaction history (a synthetic demo dataset). Detect SUSTAINED behavioural drift over
time — not a single transaction — such as escalating payments to one new recipient, early savings
liquidation, or repeatedly dismissing warnings. Decide the LEAST-RESTRICTIVE escalation level that is
still safe, from 1 (clearer information) to 5 (human SeniorCare support). The customer always keeps final
authority; the Guardian Contact is informed, never in charge. You never diagnose medical or cognitive
conditions — you identify possible financial vulnerability, exploitation, confusion, or a major life
change. Be warm and clear. Always call assess_financial_care.`;

export interface CareResult {
  id: string;
  scenario: CareScenario;
  dataset: 'synthetic-demo';
  events: CareEvent[];
  drift_detected: boolean;
  escalation_level: number;
  level_label: string;
  pattern_summary: string;
  contextual_questions: string[];
  message_to_grace: string;
  message_to_guardian: string;
  source: 'live' | 'cached_fallback';
  timestamp: number;
}

function cachedCareVerdict(scenario: CareScenario): { tool_calls: ToolCall[]; model_raw_text: string } {
  if (scenario === 'stable') {
    return {
      tool_calls: [
        {
          tool: 'assess_financial_care',
          input: {
            drift_detected: false,
            escalation_level: 1,
            pattern_summary:
              'Spending is stable and consistent with Grace\'s long-standing routine — groceries, utilities, regular helper and family transfers. No sustained drift.',
            contextual_questions: [],
            message_to_grace:
              'Everything looks normal, Grace. Your spending this month matches your usual routine. No action needed — I\'m just keeping watch in the background.',
            message_to_guardian: '',
          },
        },
      ],
      model_raw_text: 'Stable pattern, no drift. Level 1 (clearer information only).',
    };
  }
  return {
    tool_calls: [
      {
        tool: 'assess_financial_care',
        input: {
          drift_detected: true,
          escalation_level: 4,
          pattern_summary:
            'Over four weeks, payments to a brand-new recipient (David Lim) escalated from S$500 to S$15,000, a transfer limit was raised, a fixed deposit was broken early, and new-payee cautions were dismissed three times. This sustained pattern is consistent with a grooming / authorised-push-payment scam.',
          contextual_questions: [
            'Has David Lim asked you to keep these payments private, or to move quickly?',
            'Did someone contact you about an investment, a fine, or a problem with your account before the first payment?',
            'Would it be alright if we take a short pause and I ask a SeniorCare colleague to call you?',
          ],
          message_to_grace:
            'Grace, I\'ve noticed something I care about. Your payments to David Lim have grown a lot over the past month — from S$500 to S$15,000 — and you recently broke a fixed deposit to keep them going. This is the pattern we see when someone is being pressured. Nothing is blocked and you\'re still in control, but I\'d gently like to pause and check in with you.',
          message_to_guardian:
            'Heads up — Guardian Angel has noticed a sustained pattern on your mum\'s account: escalating payments to a new recipient over the past month, plus a broken fixed deposit. She\'s aware and still in control; a SeniorCare colleague is being asked to call her. This is for your awareness only.',
        },
      },
    ],
    model_raw_text: 'Sustained grooming pattern detected. Level 4 (Guardian Contact alert + human handoff pending).',
  };
}

export async function runCareAnalysis(scenario: CareScenario, forceDemo: boolean): Promise<CareResult> {
  const { events } = generateHistory(scenario);
  const cached = cachedCareVerdict(scenario);

  const userContent = `Synthetic demo history for customer Grace (68), most recent last:
${JSON.stringify(events, null, 2)}

Analyse for SUSTAINED drift over time and call assess_financial_care with the least-restrictive safe escalation level.`;

  const { tool_calls, source } = await reason({
    system: CARE_SYSTEM,
    tools: [CARE_TOOL],
    userContent,
    cached,
    forceDemo,
    forceTool: 'assess_financial_care',
    maxTokens: 900,
  });

  const input = (tool_calls[0]?.input ?? {}) as Record<string, unknown>;
  const asStr = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const asBool = (v: unknown) => v === true;
  const asArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  let level = typeof input.escalation_level === 'number' ? input.escalation_level : 1;
  level = Math.min(5, Math.max(1, Math.round(level)));

  if (asBool(input.drift_detected)) {
    // Scoped to the recipient the drift is actually ABOUT (the grooming dataset always
    // centres on David Lim) — so this finding only inflates a transfer to THAT recipient,
    // never an unrelated later transfer just because Adaptive Care was demoed this session.
    const subject = events.find((e) => e.type === 'payment' && e.recipient && e.recipient !== 'SP Group')?.recipient;
    setLayerSignals('care', [
      {
        category: 'behavioural',
        label: 'Sustained behavioural drift',
        detail: asStr(input.pattern_summary, 'Escalating payments and warning dismissals detected over several weeks.'),
        severity: level >= 4 ? 'high' : 'medium',
        subject,
      },
    ]);
  } else {
    setLayerSignals('care', []);
  }

  return {
    id: `care_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scenario,
    dataset: 'synthetic-demo',
    events,
    drift_detected: asBool(input.drift_detected),
    escalation_level: level,
    level_label: CARE_LEVELS[level - 1].label,
    pattern_summary: asStr(input.pattern_summary),
    contextual_questions: asArr(input.contextual_questions),
    message_to_grace: asStr(input.message_to_grace),
    message_to_guardian: asStr(input.message_to_guardian),
    source,
    timestamp: Date.now(),
  };
}
