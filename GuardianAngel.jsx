import React, { useState, useMemo } from "react";

/*
  Guardian Angel — OCBC-faithful mock banking app with a functioning AI fraud agent.
  Matches the real OCBC Digital structure: bottom nav (Home / Pay & Transfer / Cards / More),
  smart-shortcut quick-action tray, Net Worth dashboard, hide-balance toggle, activity feed,
  Money Lock — all as a working mock. The Pay & Transfer flow runs the live/fallback AI agent.
*/

const C = {
  red: "#E4002B", redDark: "#B80022", redSoft: "#FFE9ED",
  ink: "#16181D", sub: "#717784", faint: "#9AA0AB",
  line: "#ECEDF0", bg: "#F2F3F5", card: "#FFFFFF",
  green: "#0E9F6E", greenSoft: "#E4F6EF",
  amber: "#E8910C", amberSoft: "#FCEFD6",
  blue: "#1666D4", blueSoft: "#E8F0FC",
};

const ACCOUNT = { name: "Grace Tan", greeting: "Grace", accountNo: "501-234567-001", product: "FRANK Account", balance: 48250.0, dailyLimit: 25000, spentToday: 0 };
const WEALTH = { cashAccounts: 48250.0, fixedDeposit: 0.0, investments: 62400.0, insurance: 18000.0, cards: -842.15 };

const PAYEES = [
  { id: "p1", name: "SP Group (Utilities)", bank: "OCBC", acct: "•••• 4421", trusted: true, timesPaid: 36, avgAmount: 142, lastPaid: "2 weeks ago", initials: "SP", color: "#1565C0" },
  { id: "p2", name: "Marcus Tan (Son)", bank: "DBS", acct: "•••• 9087", trusted: true, timesPaid: 22, avgAmount: 300, lastPaid: "5 days ago", initials: "MT", color: "#0E9F6E" },
  { id: "p3", name: "Mei Ling (Helper)", bank: "OCBC", acct: "•••• 1180", trusted: true, timesPaid: 18, avgAmount: 800, lastPaid: "1 month ago", initials: "ML", color: "#7B1FA2" },
  { id: "p4", name: "Tan Clinic", bank: "UOB", acct: "•••• 3302", trusted: true, timesPaid: 7, avgAmount: 90, lastPaid: "3 weeks ago", initials: "TC", color: "#E8910C" },
];

const CARDS0 = [
  { id: "c1", name: "FRANK Debit Card", num: "•••• •••• •••• 7781", type: "Debit", grad: "linear-gradient(135deg,#E4002B,#B80022)", balance: null, limit: null, locked: false },
  { id: "c2", name: "365 Credit Card", num: "•••• •••• •••• 2043", type: "Credit", grad: "linear-gradient(135deg,#2B2D33,#4A4D57)", balance: -842.15, limit: 8000, locked: false },
];

const PROFILE = { typicalMax: 1500, median: 220, newPayeeLast90d: 0, recentDepositBroken: true };

const ACTIVITY = [
  { n: "SP Group", t: "Utilities · GIRO", a: -138.2, d: "Today" },
  { n: "NTUC FairPrice", t: "PayNow", a: -54.3, d: "Yesterday" },
  { n: "Pension credit", t: "CPF LIFE", a: 1480.0, d: "2 days ago" },
  { n: "Mei Ling", t: "Transfer · Helper", a: -800.0, d: "5 days ago" },
];

const SGD = (n) => "S$" + Math.abs(n).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SIGNED = (n) => (n < 0 ? "-" : "+") + SGD(n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ACTIONS = {
  allow: { label: "Allow", color: C.green },
  step_up: { label: "Step-up verify", color: C.blue },
  hold_alert: { label: "Hold & alert guardian", color: C.amber },
  block: { label: "Block & warn", color: C.red },
};

function fallbackDecide(ctx) {
  const { amount, payee, reason, profile } = ctx;
  const signals = []; let risk = 0;
  const isNew = !payee.trusted;
  const devTyp = amount / profile.typicalMax;
  const devPay = payee.timesPaid > 0 ? amount / payee.avgAmount : Infinity;
  if (isNew) { signals.push("Recipient has never been paid before (new payee)."); risk += 35; }
  else signals.push(`Recipient is trusted — paid ${payee.timesPaid}×, avg ${SGD(payee.avgAmount)}.`);
  if (amount > profile.typicalMax) { signals.push(`Amount is ${devTyp.toFixed(1)}× Grace's typical max of ${SGD(profile.typicalMax)}.`); risk += Math.min(40, devTyp * 8); }
  else signals.push("Amount is within Grace's normal spending range.");
  if (!isNew && devPay > 4) { signals.push(`Amount is ${devPay.toFixed(0)}× larger than usual for this payee.`); risk += 15; }
  if (profile.recentDepositBroken && amount > 5000) { signals.push("A fixed deposit was just liquidated before this transfer — a common scam setup."); risk += 20; }
  const urgent = /urgent|now|immediately|emergency|police|officer|fine|arrest|invest|guarantee|return|crypto|bitcoin/i.test(reason || "");
  if (urgent) { signals.push("Stated reason contains urgency / authority / investment language."); risk += 25; }
  if ((reason || "").trim().length === 0 && (isNew || amount > profile.typicalMax)) { signals.push("No reason given for an unusual transfer."); risk += 8; }
  risk = Math.max(0, Math.min(100, Math.round(risk)));
  let action = "allow";
  if (risk >= 70) action = "block"; else if (risk >= 45) action = "hold_alert"; else if (risk >= 25) action = "step_up";
  const ex = {
    allow: "This transfer fits how Grace normally banks, so it proceeds without friction.",
    step_up: "This is a little unusual for Grace, so I'd confirm it's really her before sending.",
    hold_alert: "This deviates sharply from Grace's normal pattern. I'm placing a short hold and letting her guardian know — Grace still decides whether to release it.",
    block: "This matches several scam indicators at once. I'm strongly warning Grace and recommending she pause. She keeps final say.",
  };
  return { engine: "fallback", risk, action, signals, explanation: ex[action], interpret: isNew ? "New recipient, judged against Grace's history and context." : "Known recipient, judged against her usual amounts and timing." };
}

async function liveDecide(ctx) {
  const tools = [{
    name: "decide_transfer",
    description: "Decide how to handle a transfer for an elderly customer by comparing it to her NORMAL behaviour, not raw amount.",
    input_schema: { type: "object", properties: {
      action: { type: "string", enum: ["allow", "step_up", "hold_alert", "block"] },
      risk: { type: "integer" }, interpret: { type: "string" },
      signals: { type: "array", items: { type: "string" } }, explanation: { type: "string" },
    }, required: ["action", "risk", "interpret", "signals", "explanation"] },
  }];
  const sys = "You are Guardian Angel, an autonomous financial-protection agent for OCBC customer Grace. Judge transfers by deviation from her NORMAL banking life, never raw amount. A large transfer to a trusted frequent payee is usually fine; a smaller one to a brand-new payee with urgency or just after liquidating savings is suspicious. Choose one action: allow, step_up, hold_alert, block. Grace keeps final authority; her son Marcus is informational only. Always call decide_transfer.";
  const um = `Transfer: ${SGD(ctx.amount)} to ${ctx.payee.name} (${ctx.payee.trusted ? `trusted, paid ${ctx.payee.timesPaid}×, avg ${SGD(ctx.payee.avgAmount)}` : "NEW payee"}). Reason: ${ctx.reason ? `"${ctx.reason}"` : "none"}. Normal profile: typical max ${SGD(ctx.profile.typicalMax)}, median ${SGD(ctx.profile.median)}, new payees 90d ${ctx.profile.newPayeeLast90d}, just liquidated deposit: ${ctx.profile.recentDepositBroken ? "yes" : "no"}. Decide.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: sys, tools, tool_choice: { type: "tool", name: "decide_transfer" }, messages: [{ role: "user", content: um }] }),
  });
  const data = await res.json();
  const t = (data.content || []).find((b) => b.type === "tool_use");
  if (!t) throw new Error("no tool use");
  return { engine: "live", ...t.input };
}

const Pill = ({ children, color, bg }) => (<span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: "3px 9px", borderRadius: 999 }}>{children}</span>);
const Avatar = ({ initials, color, size = 42 }) => (<div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.36, flexShrink: 0 }}>{initials}</div>);
const Icon = ({ d, c = "currentColor", s = 22 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>);
const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  transfer: <><path d="M7 7h11l-3-3" /><path d="M17 17H6l3 3" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
};

const STEP_META = [
  ["observe", "Observe", "Reads the request and account context"],
  ["interpret", "Interpret", "Compares it to Grace's normal life"],
  ["decide", "Decide", "Selects one action from its toolset"],
  ["act", "Act", "Applies the decision to the transfer"],
  ["explain", "Explain", "Tells Grace why, in plain language"],
];

export default function GuardianAngel() {
  const [tab, setTab] = useState("home");
  const [flow, setFlow] = useState(null);
  const [engine, setEngine] = useState("fallback");
  const [hideBal, setHideBal] = useState(false);
  const [payee, setPayee] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [decision, setDecision] = useState(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [released, setReleased] = useState(false);
  const [cards, setCards] = useState(CARDS0);
  const [toast, setToast] = useState("");
  const [npName, setNpName] = useState(""); const [npBank, setNpBank] = useState("DBS"); const [npAcct, setNpAcct] = useState("");

  const numeric = parseFloat(amount || "0") || 0;
  const remaining = ACCOUNT.dailyLimit - ACCOUNT.spentToday;
  const netWorth = WEALTH.cashAccounts + WEALTH.fixedDeposit + WEALTH.investments + WEALTH.insurance + WEALTH.cards;

  const amountError = useMemo(() => {
    if (!amount) return "";
    if (numeric <= 0) return "Enter an amount greater than zero.";
    if (numeric > ACCOUNT.balance) return `Exceeds available balance of ${SGD(ACCOUNT.balance)}.`;
    if (numeric > remaining) return `Above daily limit. ${SGD(remaining)} left today.`;
    return "";
  }, [amount, numeric, remaining]);

  function ping(m) { setToast(m); setTimeout(() => setToast(""), 2200); }
  function resetFlow() { setFlow(null); setPayee(null); setAmount(""); setReason(""); setErr(""); setDecision(null); setActiveStep(-1); setReleased(false); setNpName(""); setNpAcct(""); }

  async function runAgent() {
    setFlow("processing"); setErr(""); setDecision(null); setReleased(false);
    const ctx = { amount: numeric, payee, reason, profile: PROFILE, account: ACCOUNT };
    setActiveStep(0); await wait(520); setActiveStep(1); await wait(520);
    let result;
    try { result = engine === "live" ? await liveDecide(ctx) : fallbackDecide(ctx); }
    catch { result = { ...fallbackDecide(ctx), engine: "fallback", degraded: true }; }
    setActiveStep(2); await wait(430); setActiveStep(3); await wait(430); setActiveStep(4); await wait(330);
    setDecision(result); setFlow("outcome");
  }

  const showProtect = flow === "processing" || flow === "outcome";

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", background: C.bg, minHeight: 720, display: "flex", justifyContent: "center", padding: 20, color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *{-webkit-font-smoothing:antialiased;}
        .ga-tap{transition:transform .08s ease,background .15s ease;}
        .ga-tap:active{transform:scale(.97);}
        @keyframes ga-spin{to{transform:rotate(360deg)}}
        @keyframes ga-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .ga-screen{animation:ga-up .25s ease both;}
        .ga-scroll::-webkit-scrollbar{width:0;}
      `}</style>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ width: 372, background: C.card, borderRadius: 38, overflow: "hidden", boxShadow: "0 30px 70px rgba(20,24,40,.22)", border: "8px solid #0C0D10", position: "relative", height: 760 }}>
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 130, height: 26, background: "#0C0D10", borderRadius: "0 0 16px 16px", zIndex: 20 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 22px 6px", fontSize: 12.5, fontWeight: 700, color: tab === "home" && !flow ? "#fff" : C.ink, position: "relative", zIndex: 10, background: tab === "home" && !flow ? "transparent" : "#fff" }}>
            <span>9:41</span><span>5G ▮▮▮</span>
          </div>

          <div className="ga-scroll" style={{ height: 668, overflowY: "auto", background: C.bg, position: "relative" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 15, display: "flex", justifyContent: "flex-end", padding: "0 14px", marginTop: -2, pointerEvents: "none" }}>
              <div style={{ pointerEvents: "auto", marginTop: 8, background: "rgba(12,13,16,.78)", borderRadius: 10, padding: 3, display: "flex", gap: 2 }}>
                {["fallback", "live"].map((e) => (<button key={e} className="ga-tap" onClick={() => setEngine(e)} style={{ border: 0, cursor: "pointer", padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 800, background: engine === e ? "#fff" : "transparent", color: engine === e ? C.ink : "#fff" }}>{e === "fallback" ? "Demo" : "Live AI"}</button>))}
              </div>
            </div>

            {flow ? (
              <TransferFlow flow={flow} setFlow={setFlow} payee={payee} setPayee={setPayee} amount={amount} setAmount={setAmount} reason={reason} setReason={setReason} amountError={amountError} numeric={numeric} remaining={remaining} npName={npName} setNpName={setNpName} npBank={npBank} setNpBank={setNpBank} npAcct={npAcct} setNpAcct={setNpAcct} err={err} setErr={setErr} engine={engine} activeStep={activeStep} decision={decision} released={released} setReleased={setReleased} onRun={runAgent} onExit={resetFlow} />
            ) : (
              <>
                {tab === "home" && <Home hideBal={hideBal} setHideBal={setHideBal} onTransfer={() => setFlow("payees")} ping={ping} />}
                {tab === "transfer" && <PayHub onStart={() => setFlow("payees")} />}
                {tab === "cards" && <CardsTab cards={cards} setCards={setCards} ping={ping} />}
                {tab === "more" && <MoreTab netWorth={netWorth} hideBal={hideBal} ping={ping} />}
              </>
            )}
          </div>

          {!flow && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64, background: "#fff", borderTop: "1px solid " + C.line, display: "flex", justifyContent: "space-around", alignItems: "center", paddingBottom: 4 }}>
              {[["home", "Home", ICONS.home], ["transfer", "Pay & Transfer", ICONS.transfer], ["cards", "Cards", ICONS.card], ["more", "More", ICONS.more]].map(([k, l, ic]) => (
                <button key={k} className="ga-tap" onClick={() => setTab(k)} style={{ border: 0, background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1 }}>
                  <Icon d={ic} c={tab === k ? C.red : C.faint} s={22} /><span style={{ fontSize: 9.5, fontWeight: 700, color: tab === k ? C.red : C.faint }}>{l}</span>
                </button>
              ))}
            </div>
          )}
          {toast && <div style={{ position: "absolute", bottom: 78, left: "50%", transform: "translateX(-50%)", background: "rgba(12,13,16,.9)", color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "9px 16px", borderRadius: 10, zIndex: 30, whiteSpace: "nowrap" }}>{toast}</div>}
        </div>

        <div style={{ width: 360, background: C.card, borderRadius: 18, border: "1px solid " + C.line, padding: 18, boxShadow: "0 8px 24px rgba(20,24,40,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: C.red, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14 }}>✦</div>
            <strong style={{ fontSize: 15 }}>Guardian Angel — reasoning</strong>
          </div>
          <p style={{ fontSize: 12, color: C.sub, margin: "0 0 14px" }}>{showProtect ? "Watch the agent reason at the confirm step. It judges deviation from Grace's normal life, not raw amount." : "Start a transfer (Pay & Transfer) to see the agent reason live. It judges deviation from Grace's normal life, not raw amount."}</p>

          {STEP_META.map(([key, title, desc], i) => {
            const done = decision && i <= 4;
            const active = flow === "processing" && activeStep === i;
            const reached = flow === "processing" || decision;
            return (
              <div key={key} style={{ display: "flex", gap: 10, padding: "8px 0", opacity: reached ? (i <= Math.max(activeStep, decision ? 4 : -1) ? 1 : 0.32) : 0.45 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#fff", background: active ? C.amber : done ? C.green : "#C9CCD1" }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{title}{active ? " …" : ""}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{desc}</div>
                  {key === "interpret" && decision && <div style={{ marginTop: 5, fontSize: 11.5, fontStyle: "italic" }}>{decision.interpret}</div>}
                  {key === "decide" && decision && <div style={{ marginTop: 5 }}><Pill color="#fff" bg={ACTIONS[decision.action].color}>{ACTIONS[decision.action].label} · risk {decision.risk}</Pill></div>}
                  {key === "explain" && decision && <div style={{ marginTop: 5, fontSize: 12, background: C.bg, padding: 8, borderRadius: 8 }}>{decision.explanation}</div>}
                </div>
              </div>
            );
          })}

          {decision && (
            <div style={{ marginTop: 10, borderTop: "1px solid " + C.line, paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Signals used</div>
              {decision.signals.map((s, i) => <div key={i} style={{ fontSize: 11.5, display: "flex", gap: 6, marginBottom: 4 }}><span style={{ color: C.red }}>•</span><span>{s}</span></div>)}
              <div style={{ marginTop: 8, fontSize: 11, color: C.sub }}>Engine: <b>{decision.engine === "live" ? "Live Claude (tool use)" : "Deterministic fallback"}</b>{decision.degraded && " · live failed, fell back safely"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Home({ hideBal, setHideBal, onTransfer, ping }) {
  const mask = (v) => (hideBal ? "S$ ••••••" : v);
  const shortcuts = [["Transfer", ICONS.transfer, onTransfer], ["Pay bills", ICONS.card, () => ping("Pay bills — mock")], ["PayNow", ICONS.transfer, () => ping("PayNow — mock")], ["Scan & pay", ICONS.more, () => ping("Scan & pay — mock")]];
  return (
    <div className="ga-screen">
      <div style={{ background: "linear-gradient(160deg,#E4002B 0%,#B80022 90%)", color: "#fff", padding: "4px 20px 26px", borderRadius: "0 0 26px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div><div style={{ fontSize: 13, opacity: .85 }}>Good morning</div><div style={{ fontSize: 21, fontWeight: 800 }}>{ACCOUNT.greeting}</div></div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="ga-tap" onClick={() => setHideBal(!hideBal)} style={{ border: 0, background: "rgba(255,255,255,.16)", borderRadius: 10, width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer" }}><Icon d={ICONS.eye} c="#fff" s={18} /></button>
            <button className="ga-tap" onClick={() => ping("3 new notifications")} style={{ border: 0, background: "rgba(255,255,255,.16)", borderRadius: 10, width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer" }}><Icon d={ICONS.bell} c="#fff" s={18} /></button>
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,.13)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, opacity: .85 }}>{ACCOUNT.product} · {ACCOUNT.accountNo}</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 3, letterSpacing: -0.5 }}>{mask(SGD(ACCOUNT.balance))}</div>
          <div style={{ fontSize: 11, opacity: .8 }}>Available balance</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", padding: "18px 20px 6px" }}>
        {shortcuts.map(([l, ic, fn]) => (
          <button key={l} className="ga-tap" onClick={fn} style={{ border: 0, background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, width: 72 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "#fff", boxShadow: "0 4px 12px rgba(20,24,40,.07)", display: "grid", placeItems: "center" }}><Icon d={ic} c={C.red} s={22} /></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.ink }}>{l}</span>
          </button>
        ))}
      </div>

      <div style={{ margin: "14px 16px 0", background: "linear-gradient(135deg,#16181D,#2A2D35)", borderRadius: 16, padding: 15, color: "#fff", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.red, display: "grid", placeItems: "center", fontSize: 18, fontWeight: 800, flexShrink: 0 }}>✦</div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 800 }}>Guardian Angel is on</div><div style={{ fontSize: 11.5, opacity: .8 }}>Protecting transfers against scams · learning your patterns</div></div>
        <div style={{ width: 38, height: 22, borderRadius: 999, background: C.green, position: "relative" }}><div style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} /></div>
      </div>

      <div style={{ background: "#fff", margin: "16px 12px 90px", borderRadius: 16, padding: "4px 16px 6px", border: "1px solid " + C.line }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0 6px" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Your activity</span>
          <button onClick={() => ping("All transactions — mock")} style={{ border: 0, background: "none", color: C.red, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>See all</button>
        </div>
        {ACTIVITY.map((x, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderTop: i ? "1px solid " + C.line : 0 }}>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: x.a < 0 ? C.redSoft : C.greenSoft, color: x.a < 0 ? C.red : C.green, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15 }}>{x.n[0]}</div>
              <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{x.n}</div><div style={{ fontSize: 11, color: C.sub }}>{x.t} · {x.d}</div></div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: x.a < 0 ? C.ink : C.green }}>{hideBal ? "••••" : SIGNED(x.a)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayHub({ onStart }) {
  const opts = [["Transfer to OCBC", "Instant, free"], ["Transfer to other banks", "FAST / GIRO"], ["PayNow", "Mobile or NRIC"], ["Pay bills", "Billing organisations"], ["Overseas transfer", "10 currencies"]];
  return (
    <div className="ga-screen" style={{ padding: "14px 16px 90px" }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: "6px 4px 14px" }}>Pay &amp; Transfer</h2>
      {opts.map(([t, s]) => (
        <button key={t} className="ga-tap" onClick={onStart} style={{ width: "100%", background: "#fff", border: "1px solid " + C.line, borderRadius: 14, padding: "15px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}>
          <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: C.redSoft, display: "grid", placeItems: "center" }}><Icon d={ICONS.transfer} c={C.red} s={20} /></div>
            <div><div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div><div style={{ fontSize: 11.5, color: C.sub }}>{s}</div></div>
          </div>
          <span style={{ color: C.faint, fontSize: 20 }}>›</span>
        </button>
      ))}
    </div>
  );
}

function CardsTab({ cards, setCards, ping }) {
  return (
    <div className="ga-screen" style={{ padding: "14px 16px 90px" }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: "6px 4px 16px" }}>Cards</h2>
      {cards.map((c) => (
        <div key={c.id} style={{ marginBottom: 22 }}>
          <div style={{ height: 190, borderRadius: 18, background: c.grad, color: "#fff", padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 12px 28px rgba(20,24,40,.18)", opacity: c.locked ? .55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}><span style={{ fontWeight: 800, fontSize: 15 }}>OCBC</span>{c.locked && <Pill color="#fff" bg="rgba(0,0,0,.35)">LOCKED</Pill>}</div>
            <div>
              <div style={{ fontSize: 17, letterSpacing: 2, fontWeight: 600 }}>{c.num}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, opacity: .9 }}><span>{c.name}</span><span>{c.type}</span></div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, padding: "0 4px" }}>
            <div style={{ fontSize: 12.5, color: C.sub }}>{c.balance != null ? <>Balance <b style={{ color: C.ink }}>{SGD(c.balance)}</b> / limit {SGD(c.limit)}</> : "Linked to FRANK Account"}</div>
            <button className="ga-tap" onClick={() => { setCards(cards.map((x) => x.id === c.id ? { ...x, locked: !x.locked } : x)); ping(c.locked ? "Card unlocked" : "Card locked (Money Lock)"); }} style={{ border: "1px solid " + C.line, background: c.locked ? C.green : "#fff", color: c.locked ? "#fff" : C.ink, borderRadius: 10, padding: "7px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}>
              <Icon d={ICONS.lock} c={c.locked ? "#fff" : C.ink} s={14} />{c.locked ? "Locked" : "Lock card"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MoreTab({ netWorth, hideBal, ping }) {
  const rows = [["Cash & accounts", WEALTH.cashAccounts], ["Investments", WEALTH.investments], ["Insurance", WEALTH.insurance], ["Fixed deposits", WEALTH.fixedDeposit], ["Cards owing", WEALTH.cards]];
  const menu = ["Money Lock", "Manage payees", "Statements & letters", "Card services", "Personal details", "Security centre", "Help & support"];
  return (
    <div className="ga-screen" style={{ padding: "14px 16px 90px" }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: "6px 4px 14px" }}>Net worth</h2>
      <div style={{ background: "linear-gradient(135deg,#16181D,#2C2F38)", borderRadius: 18, padding: 20, color: "#fff", marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, opacity: .8 }}>Total net worth</div>
        <div style={{ fontSize: 30, fontWeight: 900, marginTop: 2 }}>{hideBal ? "S$ ••••••" : SGD(netWorth)}</div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map(([l, v]) => (<div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span style={{ opacity: .8 }}>{l}</span><span style={{ fontWeight: 700, color: v < 0 ? "#FF8A9B" : "#fff" }}>{v < 0 ? "-" : ""}{SGD(v)}</span></div>))}
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid " + C.line, overflow: "hidden" }}>
        {menu.map((m, i) => (<button key={m} className="ga-tap" onClick={() => ping(m + " — mock")} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", border: 0, borderTop: i ? "1px solid " + C.line : 0, background: "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>{m}<span style={{ color: C.faint }}>›</span></button>))}
      </div>
    </div>
  );
}

function TransferFlow(p) {
  const { flow, setFlow, payee, setPayee, amount, setAmount, reason, setReason, amountError, numeric, remaining, npName, setNpName, npBank, setNpBank, npAcct, setNpAcct, err, setErr, engine, activeStep, decision, released, setReleased, onRun, onExit } = p;
  const Header = ({ title, back }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "#fff", borderBottom: "1px solid " + C.line, position: "sticky", top: 0, zIndex: 5 }}>
      <button className="ga-tap" onClick={back} style={{ border: 0, background: "none", fontSize: 24, cursor: "pointer", color: C.red, lineHeight: 1, padding: "0 4px" }}>‹</button>
      <strong style={{ fontSize: 16 }}>{title}</strong>
      <button onClick={onExit} style={{ marginLeft: "auto", border: 0, background: "none", color: C.sub, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
    </div>
  );
  const F = { width: "100%", padding: "12px 13px", border: "1px solid " + C.line, borderRadius: 11, fontSize: 14, marginTop: 5, boxSizing: "border-box", outline: "none" };

  if (flow === "payees") return (
    <div className="ga-screen" style={{ paddingBottom: 24 }}>
      <Header title="Select recipient" back={onExit} />
      <div style={{ padding: 16 }}>
        <button className="ga-tap" onClick={() => setFlow("newpayee")} style={{ width: "100%", border: "1.5px dashed " + C.red, background: C.redSoft, color: C.red, borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer", marginBottom: 16 }}>+ New recipient</button>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.sub, marginBottom: 4, letterSpacing: .3 }}>SAVED RECIPIENTS</div>
        {PAYEES.map((x) => (
          <button key={x.id} className="ga-tap" onClick={() => { setPayee(x); setFlow("amount"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", background: "none", border: 0, borderBottom: "1px solid " + C.line, cursor: "pointer", textAlign: "left" }}>
            <Avatar initials={x.initials} color={x.color} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{x.name}</div><div style={{ fontSize: 11.5, color: C.sub }}>{x.bank} {x.acct} · paid {x.timesPaid}×</div></div>
            <span style={{ color: C.faint, fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (flow === "newpayee") return (
    <div className="ga-screen">
      <Header title="New recipient" back={() => setFlow("payees")} />
      <div style={{ padding: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>Recipient name</label>
        <input value={npName} onChange={(e) => setNpName(e.target.value)} placeholder="Full name" style={F} />
        <label style={{ fontSize: 12, fontWeight: 700, color: C.sub, display: "block", marginTop: 14 }}>Bank</label>
        <select value={npBank} onChange={(e) => setNpBank(e.target.value)} style={F}>{["DBS", "OCBC", "UOB", "Standard Chartered", "Maybank"].map((b) => <option key={b}>{b}</option>)}</select>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.sub, display: "block", marginTop: 14 }}>Account number</label>
        <input value={npAcct} onChange={(e) => setNpAcct(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 1234567890" style={F} />
        {err && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        <button className="ga-tap" onClick={() => { if (!npName.trim() || !npAcct.trim()) { setErr("Enter a name and account number."); return; } setPayee({ id: "new", name: npName.trim(), bank: npBank, acct: "•••• " + npAcct.slice(-4), trusted: false, timesPaid: 0, avgAmount: 0, lastPaid: "never", initials: npName.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(), color: "#8B8B8B" }); setErr(""); setFlow("amount"); }} style={{ width: "100%", marginTop: 22, background: C.red, color: "#fff", border: 0, borderRadius: 12, padding: 15, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Continue</button>
      </div>
    </div>
  );

  if (flow === "amount") return (
    <div className="ga-screen">
      <Header title="Enter amount" back={() => setFlow("payees")} />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0 16px" }}>
          <Avatar initials={payee.initials} color={payee.color} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{payee.name}</div><div style={{ fontSize: 11.5, color: C.sub }}>{payee.bank} {payee.acct}</div></div>
          {!payee.trusted && <Pill color={C.amber} bg={C.amberSoft}>NEW</Pill>}
        </div>
        <div style={{ textAlign: "center", padding: "14px 0" }}>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>Amount</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: C.faint }}>S$</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" inputMode="decimal" style={{ width: 180, border: 0, borderBottom: "2px solid " + (amountError ? C.red : C.line), fontSize: 38, fontWeight: 900, textAlign: "center", outline: "none", letterSpacing: -1 }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.sub }}><span>Balance {SGD(ACCOUNT.balance)}</span><span>Daily limit left {SGD(remaining)}</span></div>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.sub, display: "block", marginTop: 18 }}>Reason / reference (optional)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. monthly help, gift…" style={F} />
        {amountError && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10, fontWeight: 600 }}>{amountError}</div>}
        <button className="ga-tap" disabled={!!amountError || !amount} onClick={() => { if (!amountError && numeric > 0) setFlow("review"); }} style={{ width: "100%", marginTop: 22, background: (!!amountError || !amount) ? "#EFA9B4" : C.red, color: "#fff", border: 0, borderRadius: 12, padding: 15, fontWeight: 800, fontSize: 15, cursor: (!!amountError || !amount) ? "default" : "pointer" }}>Review transfer</button>
      </div>
    </div>
  );

  if (flow === "review") {
    const Row = ({ k, v }) => <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid " + C.line }}><span style={{ fontSize: 13, color: C.sub }}>{k}</span><span style={{ fontSize: 13, fontWeight: 700, textAlign: "right" }}>{v}</span></div>;
    return (
      <div className="ga-screen">
        <Header title="Review & confirm" back={() => setFlow("amount")} />
        <div style={{ padding: 16 }}>
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}><div style={{ fontSize: 13, color: C.sub }}>You're sending</div><div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1 }}>{SGD(numeric)}</div></div>
          <Row k="To" v={payee.name} /><Row k="Bank" v={`${payee.bank} ${payee.acct}`} /><Row k="From" v={ACCOUNT.product} /><Row k="Reason" v={reason || "—"} /><Row k="Date" v="Today" />
          <button className="ga-tap" onClick={onRun} style={{ width: "100%", marginTop: 22, background: C.red, color: "#fff", border: 0, borderRadius: 12, padding: 16, fontWeight: 900, fontSize: 15, cursor: "pointer" }}>Confirm &amp; send</button>
          <p style={{ fontSize: 11, color: C.sub, textAlign: "center", marginTop: 10 }}>Protected by Guardian Angel ✦</p>
        </div>
      </div>
    );
  }

  if (flow === "processing") return (
    <div className="ga-screen" style={{ padding: "90px 24px", textAlign: "center" }}>
      <div style={{ width: 66, height: 66, borderRadius: "50%", margin: "0 auto 18px", border: "4px solid " + C.redSoft, borderTopColor: C.red, animation: "ga-spin .9s linear infinite" }} />
      <div style={{ fontWeight: 900, fontSize: 17 }}>Guardian Angel is reviewing…</div>
      <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>{engine === "live" ? "Asking the live AI to assess this transfer" : "Assessing against Grace's normal patterns"}</div>
      <div style={{ fontSize: 12, color: C.red, marginTop: 16, fontWeight: 800 }}>{STEP_META[activeStep] ? STEP_META[activeStep][1] + "…" : ""}</div>
    </div>
  );

  if (flow === "outcome" && decision) {
    const a = decision.action, meta = ACTIONS[a], allowed = a === "allow" || released;
    if (allowed) return (
      <div className="ga-screen" style={{ padding: "56px 22px", textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.greenSoft, color: C.green, display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 36 }}>✓</div>
        <div style={{ fontWeight: 900, fontSize: 19 }}>Transfer sent</div>
        <div style={{ fontSize: 14, color: C.sub, marginTop: 4 }}>{SGD(numeric)} to {payee.name}</div>
        {released && <div style={{ fontSize: 12, color: C.amber, marginTop: 12, background: C.amberSoft, padding: 11, borderRadius: 10 }}>You released this after Guardian Angel's warning. You always have final say.</div>}
        <button className="ga-tap" onClick={onExit} style={{ marginTop: 26, background: C.red, color: "#fff", border: 0, borderRadius: 12, padding: "13px 30px", fontWeight: 800, cursor: "pointer" }}>Done</button>
      </div>
    );
    const tone = { step_up: C.blue, hold_alert: C.amber, block: C.red }[a];
    const bg = { step_up: C.blueSoft, hold_alert: C.amberSoft, block: C.redSoft }[a];
    const heading = { step_up: "Quick check needed", hold_alert: "Transfer held", block: "We'd pause this" }[a];
    return (
      <div className="ga-screen" style={{ padding: "26px 18px 30px" }}>
        <div style={{ width: 62, height: 62, borderRadius: "50%", background: bg, color: tone, display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: 30, fontWeight: 800 }}>✦</div>
        <div style={{ textAlign: "center", fontWeight: 900, fontSize: 19 }}>{heading}</div>
        <div style={{ textAlign: "center", marginTop: 6 }}><Pill color="#fff" bg={tone}>{meta.label} · risk {decision.risk}/100</Pill></div>
        <div style={{ background: C.bg, borderRadius: 12, padding: 14, marginTop: 16, fontSize: 13.5, lineHeight: 1.5 }}>{decision.explanation}</div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.sub, marginBottom: 6 }}>WHY</div>
          {decision.signals.map((s, i) => <div key={i} style={{ fontSize: 12.5, display: "flex", gap: 7, marginBottom: 5 }}><span style={{ color: tone }}>•</span><span>{s}</span></div>)}
        </div>
        {(a === "hold_alert" || a === "block") && <div style={{ marginTop: 14, fontSize: 12, color: C.sub, background: C.blueSoft, border: "1px solid #DCE8FB", borderRadius: 10, padding: 11 }}><b style={{ color: C.blue }}>Marcus (guardian) notified.</b> For awareness only — he cannot approve, block, or move money. The decision stays entirely yours.</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="ga-tap" onClick={onExit} style={{ flex: 1, background: "#fff", color: C.ink, border: "1px solid " + C.line, borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer" }}>{a === "block" ? "Cancel transfer" : "Don't send"}</button>
          <button className="ga-tap" onClick={() => setReleased(true)} style={{ flex: 1, background: a === "block" ? "#fff" : C.red, color: a === "block" ? C.red : "#fff", border: a === "block" ? "1px solid " + C.red : 0, borderRadius: 12, padding: 13, fontWeight: 800, cursor: "pointer" }}>{a === "step_up" ? "It's really me — send" : "Send anyway"}</button>
        </div>
        <p style={{ fontSize: 11, color: C.sub, textAlign: "center", marginTop: 12 }}>Grace always keeps final authority over her own account.</p>
      </div>
    );
  }
  return null;
}
