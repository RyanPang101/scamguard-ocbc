import type { ToolCall, ToolName } from './types.js';

/*
  Policy engine — the SOLE enforcer of action.

  Claude recommends; it never executes. This module takes Claude's recommended tool
  call(s) and the deterministic `allowedActions` envelope from riskContext.ts, and
  decides what actually happens. If a recommendation falls outside the envelope for
  the current risk level, the policy engine corrects it — in EITHER direction:

  - Recommendation too SEVERE for the risk level (e.g. escalating a MEDIUM case) ->
    clamp DOWN to the most restrictive action still in the envelope. This is the
    false-positive guardrail: a reversible intervention instead of an irreversible one,
    because the evidence doesn't yet establish fraud with sufficient certainty.
  - Recommendation too WEAK for the risk level (e.g. only a warning for a CRITICAL
    case) -> raise UP to the least restrictive action that still meets the envelope's
    floor. This is the under-reaction guardrail: the customer is never left with less
    protection than the risk level requires, but we also never skip straight past
    place_hold/alert_guardian to escalate_to_specialist just because the recommendation
    undershot — that would be its own kind of wrong, disproportionate response.

  Conflating these two directions was a real bug: treating every out-of-envelope
  recommendation as "too severe, downgrade to the strictest allowed action" meant an
  UNDER-reacting recommendation at CRITICAL got escalated straight to
  escalate_to_specialist (skipping hold + alert), while the explanation text still
  claimed a "reversible action was chosen over an irreversible one" — which was the
  opposite of what had just happened. Fixed by detecting direction from each
  recommendation's position relative to the allowed envelope, not just membership.
*/

// Ordered least -> most restrictive, for the transfer-intervention tools only.
// (assess_recipient_network / assess_financial_care are single-verdict tools handled
// by their own forced tool_choice and are not subject to this ladder.)
const RESTRICTIVENESS: ToolName[] = [
  'allow_transaction',
  'issue_warning',
  'request_verification',
  'place_hold',
  'alert_guardian',
  'escalate_to_specialist',
];

export interface PolicyDecision {
  finalTools: ToolCall[];
  downgraded: boolean; // true whenever the policy engine overrode Claude's recommendation, in either direction
  downgradeReason: string | null;
}

export function enforcePolicy(recommended: ToolCall[], allowedActions: ToolName[]): PolicyDecision {
  if (recommended.length === 0) {
    return { finalTools: [], downgraded: false, downgradeReason: null };
  }

  const allowedInLadder = allowedActions.filter((t) => RESTRICTIVENESS.includes(t));
  const allowedIndices = allowedInLadder.map((t) => RESTRICTIVENESS.indexOf(t));
  const floorIdx = Math.min(...allowedIndices); // least restrictive allowed action
  const ceilingIdx = Math.max(...allowedIndices); // most restrictive allowed action

  let downgraded = false;
  let downgradeReason: string | null = null;

  const finalTools = recommended.map((call) => {
    if (!RESTRICTIVENESS.includes(call.tool)) return call; // not a ladder tool — pass through
    const idx = RESTRICTIVENESS.indexOf(call.tool);
    if (idx >= floorIdx && idx <= ceilingIdx) return call; // already within envelope

    downgraded = true;

    if (idx > ceilingIdx) {
      // Too severe for this risk level — clamp down. The genuine false-positive guardrail.
      const fallback = RESTRICTIVENESS[ceilingIdx];
      downgradeReason =
        `Claude recommended "${call.tool}", which is more severe than this risk level's policy ` +
        `envelope permits. The policy engine enforced "${fallback}" instead — a reversible ` +
        `intervention was chosen because the available evidence does not establish fraud with ` +
        `sufficient certainty for an irreversible one.`;
      return { tool: fallback, input: call.input };
    }

    // Too weak for this risk level — raise to the MINIMUM required action, not the maximum.
    const fallback = RESTRICTIVENESS[floorIdx];
    downgradeReason =
      `Claude recommended "${call.tool}", which is less protective than this risk level's policy ` +
      `envelope requires. The policy engine enforced "${fallback}" instead — the minimum action ` +
      `this risk level requires, not the maximum available one.`;
    return { tool: fallback, input: call.input };
  });

  return { finalTools, downgraded, downgradeReason };
}
