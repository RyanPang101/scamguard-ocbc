# Integrating GuardianAngel.jsx into the project

`GuardianAngel.jsx` is a self-contained, working prototype of the OCBC Guardian Angel
demo: an authentic OCBC transfer flow where the agent intercepts at the confirm step,
places a temporary hold, alerts Marcus, and leaves the release decision with Grace.
Use it as the **visual + behavioural source of truth** for the real build.

## Quick way to run it (see it immediately)
1. In a Vite + React project: `npm create vite@latest guardian -- --template react`
2. Copy `GuardianAngel.jsx` into `src/`.
3. In `src/main.jsx`, import and render it:
   ```jsx
   import App from "./GuardianAngel.jsx";
   ```
4. `npm run dev`. It uses only React + inline styles — no Tailwind, no extra deps — so it runs as-is.

## What this file already does (do NOT regress these)
- Real OCBC transfer journey: Home → Pay & Transfer → Amount → Review → intercept.
- The **agent decides the risk tier from Grace's behaviour** (`decide()`), NOT from a manual tier picker. Behaviour scenarios (`SCENARIOS`) are the input; the tier is the output.
- **Hold / release loop**: on HIGH/CRITICAL the agent places a temporary hold; Grace
  chooses "Someone asked me to — stop it" (cancel) or "No, this is me — release it"
  (she lifts the hold herself). Grace holds release authority.
- **Marcus is informed only** — his phone shows a notification, never an approve/deny
  control over her money.
- Live agent panel shows Observe → Interpret → Decide → Act → Explain with the chosen
  `place_hold()` / `alert_guardian()` / `escalate_to_specialist()` tool calls.
- Bounded autonomy is stated in the UI: no seize/permanent-freeze action exists.

## How to turn this into the real product (the one change that matters)
Right now `decide()` and `explain()` are deterministic stand-ins so the demo is reliable.
For the "autonomous AI backend" claim, route the **Decide** and **Explain** steps through
a live Claude API call using **tool use**, per `BUILD_SPEC.md`:

1. Add a small backend (Express) endpoint `POST /assess` that holds the `ANTHROPIC_API_KEY`
   (never in front-end code).
2. Move the action space (`allow_transaction`, `issue_warning`, `request_verification`,
   `place_hold`, `alert_guardian`, `escalate_to_specialist`) into Anthropic tool definitions.
   There must be NO seize/permanent-freeze tool.
3. Send the behavioural context (the `SCENARIOS` shape + `prior_outcomes`) to the model and
   let the MODEL choose which tool(s) to call. The rule-based score may be passed as a hint
   the model considers, but the action selection must come from the model — not an `if`.
4. The model returns the chosen tool(s) + `message_to_grace` / `message_to_marcus`; feed
   those into the existing UI (`explain()` text and Marcus's alert become AI-generated).
5. **Keep `decide()`/`explain()` as the cached fallback** for stage wifi failure: try the
   live call first, fall back to the deterministic version on error/timeout. The audience
   can't tell.

## Wiring the front-end to the backend
Replace the body of `confirm()` so that instead of calling `decide(s)` directly, it
`await`s `POST /assess` with the behavioural context, then drives the same animation
sequence using the model's returned tier/actions/messages. The whole staged timeline
(`setActive(0..4)`, `setMarcus(true)`, `setStep("intercept")`) stays — only the source of
the decision changes from local function to API response.

## Styling note
This prototype uses inline styles for portability. If the project standardises on Tailwind,
Claude Code may convert the inline styles to Tailwind classes — but preserve the exact OCBC
palette (red `#ED1C24`, backgrounds `#F2F3F5`/`#FFFFFF`, agent navy `#0C1A28`/`#11243A`) and
the layout/animation behaviour. Match this design; don't redesign it.

## Definition of done for the real build
A judge opens Grace's app and Marcus's phone side by side, watches Grace go through a real
OCBC transfer, sees the agent panel reason live and CHOOSE to hold + alert at the confirm
step, reads an AI-generated explanation, and can switch to "Normal payment" to watch the
same engine choose a lighter touch. The hold is released only by Grace.
