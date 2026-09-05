import { RISK_ASSESSMENT_SYSTEM, RISK_ASSESSMENT_TOOL } from './tools.js';
import { reason } from './reason.js';
import { allowedActionsForBand, bandForScore, matchRules, resolveBandWithDiversity } from './rules.js';
import type { MatchedRuleInfo, RiskContextSnapshot, RiskTier, ToolName } from './types.js';

/*
  The reasoning engine — orchestrates the deterministic rule table + the AI second opinion
  into one final, explainable trace.

  DETERMINISTIC FLOOR, AI CAN ONLY RAISE:
    final_score = max(deterministic_score, ai_risk_score)

  This is deliberate. The deterministic score (riskContext.ts + rules.ts) is reproducible —
  same signals always produce the same number, auditable by hand. The AI's job is to catch
  DANGEROUS COMBINATIONS the fixed severity weights might undervalue, and push the score up
  when it sees one — but it can never talk the system out of a risk the rules already found.
  In Demo mode the AI call is skipped entirely (ai_risk_score = 0), so Demo stays 100%
  reproducible; in Live mode the final score is always >= the deterministic floor.
*/

export interface ReasoningTrace {
  deterministicSnapshot: RiskContextSnapshot; // score/band/matchedRules from rules purely
  aiRiskScore: number;
  aiReasoning: string | null;
  finalScore: number;
  finalBand: RiskTier;
  finalAllowedActions: ToolName[];
  aiSource: 'live' | 'cached_fallback' | 'skipped';
}

// Cached, deterministic "second opinion" used when Demo mode is on or the live call fails —
// simply agrees with the deterministic score (contributes nothing extra), so the fallback
// path never silently invents a number. Labelled 'skipped'/'cached_fallback', never 'live'.
function cachedAiOpinion() {
  return {
    tool_calls: [
      {
        tool: 'assess_transfer_risk' as const,
        input: {
          ai_risk_score: 0,
          ai_reasoning:
            'AI second opinion not available in this mode — the deterministic rule-table score stands alone.',
        },
      },
    ],
    model_raw_text: '',
  };
}

export async function runReasoningEngine(
  snapshot: RiskContextSnapshot,
  forceDemo: boolean,
): Promise<ReasoningTrace> {
  const deterministicSnapshot = snapshot;

  if (forceDemo) {
    return {
      deterministicSnapshot,
      aiRiskScore: 0,
      aiReasoning: null,
      finalScore: deterministicSnapshot.riskScore,
      finalBand: deterministicSnapshot.riskLevel,
      finalAllowedActions: deterministicSnapshot.allowedActions,
      aiSource: 'skipped',
    };
  }

  const signalSummary = deterministicSnapshot.signals.map((s) => ({
    source: s.source,
    label: s.label,
    detail: s.detail,
  }));
  const patternSummary = deterministicSnapshot.matchedRules.map((r: MatchedRuleInfo) => ({
    name: r.name,
    description: r.description,
  }));

  const { tool_calls, source } = await reason({
    system: RISK_ASSESSMENT_SYSTEM,
    tools: [RISK_ASSESSMENT_TOOL],
    userContent: `Raw signals observed this session:\n${JSON.stringify(signalSummary, null, 2)}\n\nScam-archetype patterns already matched against these signals (informational — form your own view too):\n${JSON.stringify(patternSummary, null, 2)}\n\nGive your independent 0-100 risk score and call assess_transfer_risk.`,
    cached: cachedAiOpinion(),
    forceDemo: false,
    forceTool: 'assess_transfer_risk',
    maxTokens: 500,
  });

  const input = (tool_calls[0]?.input ?? {}) as Record<string, unknown>;
  const rawScore = typeof input.ai_risk_score === 'number' ? input.ai_risk_score : 0;
  const aiRiskScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const aiReasoning = typeof input.ai_reasoning === 'string' ? input.ai_reasoning : null;

  // The floor: the AI's number can only ever raise the final score, never lower it.
  const finalScore = Math.max(deterministicSnapshot.riskScore, aiRiskScore);
  // Re-resolve the band/actions at the FINAL score — a strong AI second opinion can push a
  // case across a band boundary the deterministic score alone didn't reach, and pattern
  // rules still apply as an additional floor. The diversity gate (spec §5) still applies: the
  // AI raises the SCORE, but it adds no new signal families, so it cannot manufacture a
  // high-risk band out of a single weak signal family — genuine cross-category evidence
  // (or a matched pattern / exceptionally strong indicator) is still required.
  const matched = matchRules(deterministicSnapshot.signals);
  const finalBand = resolveBandWithDiversity(finalScore, matched, deterministicSnapshot.signals).band;
  const finalAllowedActions = allowedActionsForBand(finalBand);

  return {
    deterministicSnapshot,
    aiRiskScore,
    aiReasoning,
    finalScore,
    finalBand,
    finalAllowedActions,
    aiSource: source,
  };
}

// Exposed for completeness/tests — same band lookup rules.ts uses.
export { bandForScore };
