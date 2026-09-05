import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowsLeftRight,
  QrCode,
  CreditCard,
  ChartLineUp,
  House,
  Wallet,
  ChartBar,
  UserCircle,
  Eye,
  EyeSlash,
  Bell,
  LockSimple,
  LockSimpleOpen,
  Plus,
  HeartStraight,
  Trash,
  ClockCounterClockwise,
  ShieldCheck,
  IdentificationCard,
} from '@phosphor-icons/react';
import PhoneFrame from '../../components/PhoneFrame';
import { addPayee as apiAddPayee, deletePayee as apiDeletePayee, executeTransfer, getAccount, getPayees, getTransactions, networkCheck, postAssess, postResolve } from '../../api';
import { useEngine } from '../../engine';
import type { Account, AssessResult, NetworkCheckResult, Payee, ToolName, TransactionRecord } from '../../types';

type Tab = 'home' | 'transfer' | 'cards' | 'profile';
type Screen = 'activity' | null;
type Flow = 'payees' | 'newpayee' | 'amount' | 'review' | 'intercept' | null;
type Phase = 'idle' | 'network' | 'assessing' | 'sent' | 'warned' | 'held' | 'released' | 'cancelled';

function actionPhase(toolCalls: { tool: ToolName }[]): 'sent' | 'warned' | 'held' {
  if (toolCalls.some((t) => t.tool === 'place_hold')) return 'held';
  if (toolCalls.some((t) => t.tool === 'issue_warning' || t.tool === 'request_verification')) return 'warned';
  return 'sent';
}

// Tiered cooling-off hold: 24h above S$10,000, else 2h for new payees above S$1,000
function holdWindowLabel(amount: number, recipientIsNew: boolean): string {
  if (amount > 10000) return '24-hour';
  if (recipientIsNew && amount > 1000) return '2-hour';
  return '2-hour';
}

// Standalone route wrapper (keeps the old single-device page working).
export default function Grace() {
  return (
    <div className="min-h-screen bg-mesh flex flex-col items-center justify-center gap-6 p-10">
      <Link to="/menu" className="absolute top-6 left-6 text-white/40 hover:text-white/70 text-sm transition">
        ← Back
      </Link>
      <GracePhone />
    </div>
  );
}

// The reusable phone itself — used standalone above, and embedded as the cockpit's hero.
export function GracePhone() {
  const [tab, setTab] = useState<Tab>('home');
  const [screen, setScreen] = useState<Screen>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [hideBal, setHideBal] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [payee, setPayee] = useState<Payee | null>(null);
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AssessResult | null>(null);
  const [cards, setCards] = useState(CARDS0);
  const [toast, setToast] = useState('');
  const [npName, setNpName] = useState('');
  const [npAcct, setNpAcct] = useState('');
  const [npEmail, setNpEmail] = useState('');
  const [emailByName, setEmailByName] = useState<Record<string, string>>({});
  const [network, setNetwork] = useState<NetworkCheckResult | null>(null);
  const { demo } = useEngine();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  async function refreshAccountData() {
    const [acc, ps, txns] = await Promise.all([getAccount(), getPayees(), getTransactions()]);
    if (acc) setAccount(acc);
    setPayees(ps);
    setTransactions(txns);
  }

  useEffect(() => {
    refreshAccountData();
  }, []);

  const dailyLimit = account?.dailyLimit ?? 50000;
  const numeric = parseFloat(amount || '0') || 0;
  const amountError =
    amount && numeric <= 0
      ? 'Enter an amount greater than zero.'
      : amount && numeric > dailyLimit
        ? `Above daily limit of S$${dailyLimit.toLocaleString()}.`
        : account && amount && numeric > account.balance
          ? 'Amount exceeds your available balance.'
          : '';

  function ping(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 2200);
  }

  function resetFlow() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setFlow(null);
    setPayee(null);
    setAmount('');
    setPhase('idle');
    setResult(null);
    setNetwork(null);
    setNpName('');
    setNpAcct('');
    setNpEmail('');
  }

  // Layer 2 runs FIRST — a recipient network-risk check before the transfer is assessed.
  async function confirmTransfer() {
    if (!payee) return;
    setFlow('intercept');
    setPhase('network');
    setNetwork(null);
    try {
      const net = await networkCheck({
        recipient_name: payee.name,
        recipient_acct: payee.acct,
        recipient_is_new: !payee.trusted,
        amount: numeric,
        contact_email: emailByName[payee.name],
        demo,
      });
      setNetwork(net);
    } catch {
      // Network layer unavailable — continue to the behavioural assessment rather than block.
      proceedToAssessment();
    }
  }

  // Layer 3 — the behavioural transfer assessment (unchanged model call).
  async function proceedToAssessment() {
    if (!payee) return;
    setPhase('assessing');
    try {
      const res = await postAssess({
        amount: numeric,
        recipient_name: payee.name,
        recipient_acct: payee.acct,
        recipient_is_new: !payee.trusted,
        demo,
      });
      timers.current.push(
        setTimeout(async () => {
          setResult(res);
          const nextPhase = actionPhase(res.tool_calls);
          setPhase(nextPhase);
          if (nextPhase === 'sent') {
            const outcome = await executeTransfer(payee.name, numeric, payee.id);
            if (outcome.ok) refreshAccountData();
          } else if (nextPhase === 'held' && res.money_lock) {
            // Money Lock already moved funds server-side — pull the real balance/pool now.
            refreshAccountData();
          }
        }, 700),
      );
    } catch {
      setPhase('idle');
    }
  }

  async function handleCancel() {
    if (!result) return;
    await postResolve(result.id, 'cancelled');
    setPhase('cancelled');
  }

  async function handleRelease() {
    if (!result || !payee) return;
    await postResolve(result.id, 'released');
    const outcome = await executeTransfer(payee.name, numeric, payee.id);
    if (outcome.ok) refreshAccountData();
    setPhase('released');
  }

  async function handleAddPayee() {
    if (!npName.trim() || !npAcct.trim()) return;
    const created = await apiAddPayee(npName.trim(), 'DBS', '•••• ' + npAcct.slice(-4));
    if (created) {
      setPayees((prev) => [...prev, created]);
      if (npEmail.trim().includes('@')) {
        setEmailByName((prev) => ({ ...prev, [created.name]: npEmail.trim() }));
      }
      setPayee(created);
      setFlow('amount');
    }
  }

  async function handleDeletePayee(id: string) {
    const ok = await apiDeletePayee(id);
    if (ok) {
      setPayees((prev) => prev.filter((p) => p.id !== id));
      ping('Recipient removed');
    }
  }

  const inFlow = flow !== null;

  return (
      <PhoneFrame label="Grace's OCBC App" sublabel="68 · OCBC customer for 31 years" light>
        <div className="text-ink h-full flex flex-col bg-app-bg font-body relative">
          {inFlow ? (
            <TransferFlow
              flow={flow}
              setFlow={setFlow}
              payees={payees}
              payee={payee}
              setPayee={setPayee}
              amount={amount}
              setAmount={setAmount}
              amountError={amountError}
              numeric={numeric}
              npName={npName}
              setNpName={setNpName}
              npAcct={npAcct}
              setNpAcct={setNpAcct}
              npEmail={npEmail}
              setNpEmail={setNpEmail}
              phase={phase}
              result={result}
              network={network}
              account={account}
              holdLabel={payee ? holdWindowLabel(numeric, !payee.trusted) : '2-hour'}
              onConfirm={confirmTransfer}
              onProceedNetwork={proceedToAssessment}
              onCancel={handleCancel}
              onRelease={handleRelease}
              onExit={resetFlow}
              onAddPayee={handleAddPayee}
            />
          ) : screen === 'activity' ? (
            <ActivityScreen transactions={transactions} hideBal={hideBal} onBack={() => setScreen(null)} />
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto pb-2">
                {tab === 'home' && (
                  <Home
                    account={account}
                    transactions={transactions}
                    hideBal={hideBal}
                    setHideBal={setHideBal}
                    onTransfer={() => setFlow('payees')}
                    onSeeAll={() => setScreen('activity')}
                    ping={ping}
                  />
                )}
                {tab === 'transfer' && <PayHub onStart={() => setFlow('payees')} />}
                {tab === 'cards' && <CardsTab cards={cards} setCards={setCards} ping={ping} account={account} />}
                {tab === 'profile' && (
                  <ProfileTab
                    payees={payees}
                    onDeletePayee={handleDeletePayee}
                    onAddPayeeStart={() => setFlow('newpayee')}
                    onOpenActivity={() => setScreen('activity')}
                    ping={ping}
                  />
                )}
              </div>
              <BottomNav tab={tab} setTab={setTab} />
            </>
          )}

          {toast && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-ink/90 text-white text-xs font-semibold px-4 py-2.5 rounded-xl z-30 whitespace-nowrap animate-pop">
              {toast}
            </div>
          )}
        </div>
      </PhoneFrame>
  );
}

const CARDS0 = [
  { id: 'c1', name: 'OCBC 360 Debit Card', num: '•••• •••• •••• 4021', type: 'Debit', grad: 'linear-gradient(135deg,#ED1C24,#C8161D)', balance: null as number | null, locked: false },
  { id: 'c2', name: 'OCBC 90°N Credit Card', num: '•••• •••• •••• 7781', type: 'Credit', grad: 'linear-gradient(135deg,#1A1A1A,#3A3D45)', balance: -842.15, locked: false },
];

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const hrs = Math.round(diffMs / (1000 * 60 * 60));
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function Home({
  account,
  transactions,
  hideBal,
  setHideBal,
  onTransfer,
  onSeeAll,
  ping,
}: {
  account: Account | null;
  transactions: TransactionRecord[];
  hideBal: boolean;
  setHideBal: (v: boolean) => void;
  onTransfer: () => void;
  onSeeAll: () => void;
  ping: (m: string) => void;
}) {
  const mask = (v: string) => (hideBal ? 'S$ ••••••' : v);
  const actions: [string, ComponentType<{ size?: number; weight?: 'bold' | 'regular' }>, boolean, () => void][] = [
    ['Pay & Transfer', ArrowsLeftRight, true, onTransfer],
    ['Scan', QrCode, false, () => ping('Scan & pay — mock')],
    ['Cards', CreditCard, false, () => ping('Cards — mock')],
    ['Invest', ChartLineUp, false, () => ping('Invest — mock')],
  ];
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="text-sm text-sub">Good afternoon, Grace</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideBal(!hideBal)}
            className="w-8 h-8 rounded-lg bg-app-card shadow-sm flex items-center justify-center text-sub"
          >
            {hideBal ? <EyeSlash size={15} weight="bold" /> : <Eye size={15} weight="bold" />}
          </button>
          <button
            onClick={() => ping('3 new notifications')}
            className="w-8 h-8 rounded-lg bg-app-card shadow-sm flex items-center justify-center text-sub"
          >
            <Bell size={15} weight="bold" />
          </button>
        </div>
      </div>
      <div className="bg-app-card rounded-2xl p-4 shadow-sm">
        <div className="text-xs text-sub">
          {account?.product ?? '360 Account'} · {account?.accountNo ?? '•••• 4021'}
        </div>
        <div className="font-heading text-[27px] font-bold text-ink mt-0.5 tracking-tight">
          {mask(`S$${(account?.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-ocbc-green font-semibold">
          <ShieldIcon c="#0F9D58" size={13} /> Guardian Angel is protecting this account
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 my-4">
        {actions.map(([label, Icon, on, fn]) => (
          <div
            key={label}
            onClick={fn}
            className={`bg-app-card rounded-xl py-3 px-1 text-center shadow-sm cursor-pointer ${
              on ? 'border-[1.5px] border-ocbc-red/20' : 'border border-transparent'
            }`}
          >
            <div
              className={`w-[30px] h-[30px] rounded-lg mx-auto mb-1.5 flex items-center justify-center text-ocbc-red ${
                on ? 'bg-ocbc-red/[0.08]' : 'bg-app-bg'
              }`}
            >
              <Icon size={16} weight="bold" />
            </div>
            <div className="text-[10.5px] text-ink font-semibold leading-tight">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-0.5 mb-2.5">
        <div className="text-xs font-bold text-ink">Recent</div>
        <button onClick={onSeeAll} className="text-xs font-semibold text-ocbc-red">
          See all
        </button>
      </div>
      {transactions.slice(0, 3).map((t) => (
        <div key={t.id} className="flex items-center gap-3 py-2 px-0.5">
          <div className="w-[34px] h-[34px] rounded-full bg-app-bg flex items-center justify-center text-sm font-bold text-sub">
            {t.name[0]}
          </div>
          <div className="flex-1">
            <div className="text-sm text-ink">{t.name}</div>
            <div className="text-[10.5px] text-faint">{relativeTime(t.timestamp)}</div>
          </div>
          <div className={`text-sm font-semibold ${t.amount < 0 ? 'text-ink' : 'text-ocbc-green'}`}>
            {hideBal ? '••••' : `${t.amount < 0 ? '-' : '+'}S$${Math.abs(t.amount).toFixed(2)}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityScreen({
  transactions,
  hideBal,
  onBack,
}: {
  transactions: TransactionRecord[];
  hideBal: boolean;
  onBack: () => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3.5 py-3 bg-app-card border-b border-app-line sticky top-0 z-10 shrink-0">
        <button onClick={onBack} className="border-0 bg-transparent text-2xl leading-none text-ocbc-red px-1">
          ‹
        </button>
        <strong className="text-[15px] text-ink">Activity</strong>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {transactions.length === 0 && <div className="text-sm text-sub text-center mt-10">No transactions yet.</div>}
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-app-line">
            <div className="w-[38px] h-[38px] rounded-full bg-app-bg flex items-center justify-center text-sm font-bold text-sub">
              {t.name[0]}
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-ink">{t.name}</div>
              <div className="text-[11px] text-faint">{new Date(t.timestamp).toLocaleString('en-SG')}</div>
            </div>
            <div className={`text-sm font-bold ${t.amount < 0 ? 'text-ink' : 'text-ocbc-green'}`}>
              {hideBal ? '••••' : `${t.amount < 0 ? '-' : '+'}S$${Math.abs(t.amount).toFixed(2)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayHub({ onStart }: { onStart: () => void }) {
  const opts: [string, string][] = [
    ['Transfer to OCBC', 'Instant, free'],
    ['Transfer to other banks', 'FAST / GIRO'],
    ['PayNow', 'Mobile or NRIC'],
    ['Pay bills', 'Billing organisations'],
  ];
  return (
    <div className="p-4">
      <h2 className="font-heading text-lg font-extrabold text-ink mx-0.5 mb-3.5">Pay &amp; Transfer</h2>
      {opts.map(([t, s]) => (
        <button
          key={t}
          onClick={onStart}
          className="w-full bg-app-card border border-app-line rounded-2xl px-4 py-3.5 mb-2.5 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ocbc-red/[0.08] flex items-center justify-center">
              <ArrowsLeftRight size={18} className="text-ocbc-red" weight="bold" />
            </div>
            <div>
              <div className="text-sm font-bold text-ink">{t}</div>
              <div className="text-xs text-sub">{s}</div>
            </div>
          </div>
          <span className="text-faint text-lg">›</span>
        </button>
      ))}
    </div>
  );
}

function CardsTab({
  cards,
  setCards,
  ping,
  account,
}: {
  cards: typeof CARDS0;
  setCards: (c: typeof CARDS0) => void;
  ping: (m: string) => void;
  account: Account | null;
}) {
  return (
    <div className="p-4">
      <h2 className="font-heading text-lg font-extrabold text-ink mx-0.5 mb-4">Cards</h2>

      {account && account.moneyLockActive && account.moneyLockPool > 0 && (
        <div className="bg-app-card rounded-2xl p-4 shadow-sm mb-5 border-[1.5px] border-ocbc-red/25">
          <div className="flex items-center gap-2 text-ocbc-red font-bold text-sm mb-1">
            <LockSimple size={16} weight="bold" /> Money Lock active
          </div>
          <p className="text-xs text-sub leading-relaxed mb-2">
            Guardian Angel secured these funds during a suspected account-takeover attempt.
          </p>
          <div className="flex justify-between text-sm">
            <span className="text-sub">Secured in Money Lock</span>
            <b className="text-ink">
              S${account.moneyLockPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </b>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-sub">Available for spending</span>
            <b className="text-ocbc-green">
              S${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </b>
          </div>
        </div>
      )}

      {cards.map((c) => (
        <div key={c.id} className="mb-5">
          <div
            className="h-[170px] rounded-2xl text-white p-5 flex flex-col justify-between shadow-lg"
            style={{ background: c.grad, opacity: c.locked ? 0.55 : 1 }}
          >
            <div className="flex justify-between items-start">
              <span className="font-extrabold text-sm">OCBC</span>
              {c.locked && (
                <span className="text-[10px] font-bold bg-black/35 rounded-full px-2 py-1">LOCKED</span>
              )}
            </div>
            <div>
              <div className="text-base tracking-widest font-semibold">{c.num}</div>
              <div className="flex justify-between mt-2.5 text-xs opacity-90">
                <span>{c.name}</span>
                <span>{c.type}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2.5 px-1">
            <div className="text-xs text-sub">
              {c.balance != null ? (
                <>
                  Balance <b className="text-ink">S${Math.abs(c.balance).toFixed(2)}</b>
                </>
              ) : (
                'Linked to 360 Account'
              )}
            </div>
            <button
              onClick={() => {
                setCards(cards.map((x) => (x.id === c.id ? { ...x, locked: !x.locked } : x)));
                ping(c.locked ? 'Card unlocked' : 'Card locked (Money Lock)');
              }}
              className={`border border-app-line rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 ${
                c.locked ? 'bg-ocbc-green text-white' : 'bg-app-card text-ink'
              }`}
            >
              {c.locked ? <LockSimple size={13} weight="bold" /> : <LockSimpleOpen size={13} weight="bold" />}
              {c.locked ? 'Locked' : 'Lock card'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileTab({
  payees,
  onDeletePayee,
  onAddPayeeStart,
  onOpenActivity,
  ping,
}: {
  payees: Payee[];
  onDeletePayee: (id: string) => void;
  onAddPayeeStart: () => void;
  onOpenActivity: () => void;
  ping: (m: string) => void;
}) {
  const [expanded, setExpanded] = useState<'payees' | 'security' | 'personal' | null>(null);
  const [biometric, setBiometric] = useState(true);
  const [twoFactor, setTwoFactor] = useState(true);

  return (
    <div className="p-4">
      <h2 className="font-heading text-lg font-extrabold text-ink mx-0.5 mb-4">Profile &amp; Settings</h2>

      <div className="bg-app-card rounded-2xl p-4 shadow-sm mb-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-ocbc-red/[0.08] flex items-center justify-center text-ocbc-red font-extrabold text-lg">
          G
        </div>
        <div>
          <div className="text-sm font-bold text-ink">Grace Tan</div>
          <div className="text-xs text-sub">OCBC customer since 1995</div>
        </div>
      </div>

      <Section
        icon={<IdentificationCard size={17} weight="bold" />}
        title="Personal details"
        subtitle="Name, contact, address"
        open={expanded === 'personal'}
        onToggle={() => setExpanded(expanded === 'personal' ? null : 'personal')}
      >
        <Row k="Full name" v="Grace Tan Siew Hoon" />
        <Row k="NRIC" v="S12••••7A" />
        <Row k="Mobile" v="+65 9•••• 2201" />
        <Row k="Email" v="grace.tan••••@gmail.com" />
        <Row k="Address" v="Blk 210 Toa Payoh Lor 8" last />
        <button onClick={() => ping('Edit personal details — mock')} className="ocbc-btn-ghost mt-3">
          Edit details
        </button>
      </Section>

      <Section
        icon={<ShieldCheck size={17} weight="bold" />}
        title="Security centre"
        subtitle="Guardian Angel, login & verification"
        open={expanded === 'security'}
        onToggle={() => setExpanded(expanded === 'security' ? null : 'security')}
      >
        <ToggleRow label="Guardian Angel scam protection" desc="Always on for this account" checked disabled />
        <ToggleRow label="Biometric login" desc="Face ID / fingerprint" checked={biometric} onChange={() => setBiometric(!biometric)} />
        <ToggleRow label="2-step verification" desc="OTP for new payees" checked={twoFactor} onChange={() => setTwoFactor(!twoFactor)} />
        <button onClick={onAddPayeeStart} className="ocbc-btn-ghost mt-1">
          Change guardian contact
        </button>
      </Section>

      <Section
        icon={<ArrowsLeftRight size={17} weight="bold" />}
        title="Manage payees"
        subtitle={`${payees.length} saved recipient${payees.length === 1 ? '' : 's'}`}
        open={expanded === 'payees'}
        onToggle={() => setExpanded(expanded === 'payees' ? null : 'payees')}
      >
        {payees.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-app-line last:border-0">
            <div>
              <div className="text-xs font-bold text-ink">{p.name}</div>
              <div className="text-[11px] text-sub">
                {p.bank} {p.acct} · paid {p.timesPaid}×
              </div>
            </div>
            <button
              onClick={() => onDeletePayee(p.id)}
              className="w-8 h-8 rounded-lg bg-app-bg flex items-center justify-center text-ocbc-red"
              aria-label={`Remove ${p.name}`}
            >
              <Trash size={14} weight="bold" />
            </button>
          </div>
        ))}
        <button onClick={onAddPayeeStart} className="ocbc-btn-ghost mt-3 flex items-center justify-center gap-1.5">
          <Plus size={14} weight="bold" /> Add new payee
        </button>
      </Section>

      <div className="bg-app-card rounded-2xl border border-app-line overflow-hidden mt-4">
        <button
          onClick={onOpenActivity}
          className="w-full flex justify-between items-center px-4 py-3.5 text-sm font-semibold text-ink border-b border-app-line"
        >
          <span className="flex items-center gap-2.5">
            <ClockCounterClockwise size={16} weight="bold" className="text-sub" /> Statements &amp; activity
          </span>
          <span className="text-faint">›</span>
        </button>
        <button
          onClick={() => ping('Help & support — mock')}
          className="w-full flex justify-between items-center px-4 py-3.5 text-sm font-semibold text-ink"
        >
          Help &amp; support
          <span className="text-faint">›</span>
        </button>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-app-card rounded-2xl border border-app-line overflow-hidden mb-3 shadow-sm">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <div className="w-9 h-9 rounded-xl bg-ocbc-red/[0.08] flex items-center justify-center shrink-0 text-ocbc-red">
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-ink">{title}</div>
          <div className="text-xs text-sub">{subtitle}</div>
        </div>
        <span className="text-faint">{open ? '︿' : '›'}</span>
      </button>
      {open && <div className="px-4 pb-4 border-t border-app-line pt-3.5">{children}</div>}
    </div>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 ${last ? '' : 'border-b border-app-line'}`}>
      <span className="text-xs text-sub">{k}</span>
      <span className="text-xs font-semibold text-ink">{v}</span>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-app-line last:border-0">
      <div className="pr-3">
        <div className="text-xs font-bold text-ink">{label}</div>
        <div className="text-[11px] text-sub">{desc}</div>
      </div>
      <button
        onClick={disabled ? undefined : onChange}
        className={`w-10 h-6 rounded-full shrink-0 relative transition ${checked ? 'bg-ocbc-green' : 'bg-app-line'} ${disabled ? 'opacity-60' : ''}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: [Tab, string, ComponentType<{ size?: number; weight?: 'bold' | 'fill'; color?: string }>][] = [
    ['home', 'Home', House],
    ['transfer', 'Pay', Wallet],
    ['cards', 'Cards', ChartBar],
    ['profile', 'Profile', UserCircle],
  ];
  return (
    <div className="flex items-center justify-around border-t border-app-line bg-app-card px-2 py-2 shrink-0">
      {items.map(([key, label, Icon]) => {
        const active = tab === key;
        return (
          <div
            key={key}
            onClick={() => setTab(key)}
            className="flex flex-col items-center gap-1 px-3 py-1 min-w-[44px] min-h-[44px] justify-center cursor-pointer"
          >
            <Icon size={20} weight={active ? 'fill' : 'bold'} color={active ? '#ED1C24' : '#9AA3AB'} />
            <span className={`text-[10px] font-semibold ${active ? 'text-ocbc-red' : 'text-faint'}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

const TIER_TONE: Record<string, string> = {
  LOW: '#0F9D58',
  MEDIUM: '#F4A100',
  HIGH: '#FF7A45',
  CRITICAL: '#ED1C24',
};

const SEV_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3 };

function TransferFlow({
  flow,
  setFlow,
  payees,
  payee,
  setPayee,
  amount,
  setAmount,
  amountError,
  numeric,
  npName,
  setNpName,
  npAcct,
  setNpAcct,
  npEmail,
  setNpEmail,
  phase,
  result,
  network,
  account,
  holdLabel,
  onConfirm,
  onProceedNetwork,
  onCancel,
  onRelease,
  onExit,
  onAddPayee,
}: {
  flow: Flow;
  setFlow: (f: Flow) => void;
  payees: Payee[];
  payee: Payee | null;
  setPayee: (p: Payee | null) => void;
  amount: string;
  setAmount: (a: string) => void;
  amountError: string;
  numeric: number;
  npName: string;
  setNpName: (s: string) => void;
  npAcct: string;
  setNpAcct: (s: string) => void;
  npEmail: string;
  setNpEmail: (s: string) => void;
  phase: Phase;
  result: AssessResult | null;
  network: NetworkCheckResult | null;
  account: Account | null;
  holdLabel: string;
  onConfirm: () => void;
  onProceedNetwork: () => void;
  onCancel: () => void;
  onRelease: () => void;
  onExit: () => void;
  onAddPayee: () => void;
}) {
  const Header = ({ title, back }: { title: string; back: () => void }) => (
    <div className="flex items-center gap-2 px-3.5 py-3 bg-app-card border-b border-app-line sticky top-0 z-10">
      <button onClick={back} className="border-0 bg-transparent text-2xl leading-none text-ocbc-red px-1">
        ‹
      </button>
      <strong className="text-[15px] text-ink">{title}</strong>
      <button onClick={onExit} className="ml-auto border-0 bg-transparent text-sub text-[13px] font-semibold">
        Cancel
      </button>
    </div>
  );

  const dailyLimit = account?.dailyLimit ?? 50000;

  if (flow === 'payees')
    return (
      <div className="h-full overflow-y-auto animate-slide-in">
        <Header title="Select recipient" back={onExit} />
        <div className="p-4">
          <button
            onClick={() => setFlow('newpayee')}
            className="w-full border-[1.5px] border-dashed border-ocbc-red bg-ocbc-red/[0.06] text-ocbc-red rounded-xl py-3.5 font-extrabold mb-4 flex items-center justify-center gap-1.5"
          >
            <Plus size={16} weight="bold" /> New recipient
          </button>
          <div className="text-xs font-extrabold text-sub mb-1 tracking-wide">SAVED RECIPIENTS</div>
          {payees.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                setPayee(x);
                setFlow('amount');
              }}
              className="w-full flex items-center gap-3 py-3 border-b border-app-line text-left"
            >
              <div
                className="w-[42px] h-[42px] rounded-full flex items-center justify-center font-extrabold text-white shrink-0"
                style={{ background: initialsColor(x.name) }}
              >
                {initials(x.name)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-ink">{x.name}</div>
                <div className="text-xs text-sub">
                  {x.bank} {x.acct} · paid {x.timesPaid}×
                </div>
              </div>
              <span className="text-faint text-lg">›</span>
            </button>
          ))}
        </div>
      </div>
    );

  if (flow === 'newpayee')
    return (
      <div className="h-full overflow-y-auto animate-slide-in">
        <Header title="New recipient" back={() => setFlow('payees')} />
        <div className="p-4">
          <label className="text-xs font-bold text-sub">Recipient name</label>
          <input
            value={npName}
            onChange={(e) => setNpName(e.target.value)}
            placeholder="Full name"
            className="w-full px-3.5 py-3 border border-app-line rounded-xl text-sm mt-1.5 outline-none"
          />
          <label className="text-xs font-bold text-sub block mt-3.5">Account number</label>
          <input
            value={npAcct}
            onChange={(e) => setNpAcct(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 1234567890"
            className="w-full px-3.5 py-3 border border-app-line rounded-xl text-sm mt-1.5 outline-none"
          />
          <label className="text-xs font-bold text-sub block mt-3.5">
            Recipient contact email <span className="text-faint font-semibold">(optional)</span>
          </label>
          <input
            value={npEmail}
            onChange={(e) => setNpEmail(e.target.value)}
            placeholder="enables a live breach check"
            className="w-full px-3.5 py-3 border border-app-line rounded-xl text-sm mt-1.5 outline-none"
          />
          <div className="text-[10.5px] text-faint mt-1.5 leading-snug">
            If provided, Guardian Angel runs a real live data-breach lookup on this address as one signal
            in the recipient-network check.
          </div>
          <button
            disabled={!npName.trim() || !npAcct.trim()}
            onClick={onAddPayee}
            className="ocbc-btn mt-6 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    );

  if (flow === 'amount' && payee)
    return (
      <div className="h-full overflow-y-auto animate-slide-in">
        <Header title="Enter amount" back={() => setFlow('payees')} />
        <div className="p-4">
          <div className="flex items-center gap-3 py-2">
            <div
              className="w-[42px] h-[42px] rounded-full flex items-center justify-center font-extrabold text-white shrink-0"
              style={{ background: initialsColor(payee.name) }}
            >
              {initials(payee.name)}
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-ink">{payee.name}</div>
              <div className="text-xs text-sub">
                {payee.bank} {payee.acct}
              </div>
              {!payee.trusted && (
                <div className="text-[10.5px] text-ocbc-red font-bold mt-0.5">● First time paying this recipient</div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center py-6">
            <div className="text-[11px] text-sub uppercase tracking-wide">Amount</div>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-xl text-sub font-bold">S$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="text-[42px] font-extrabold text-ink tracking-tight bg-transparent w-44 text-center outline-none border-b-2 border-app-line focus:border-ocbc-red"
              />
            </div>
            <div className="mt-1.5 text-xs text-faint">Daily transfer limit · S${dailyLimit.toLocaleString()}</div>
          </div>
          {amountError && <div className="text-ocbc-red text-xs font-semibold mb-2.5">{amountError}</div>}
          <button
            disabled={!!amountError || !amount}
            onClick={() => !amountError && numeric > 0 && setFlow('review')}
            className="ocbc-btn disabled:opacity-50"
          >
            Review transfer
          </button>
        </div>
      </div>
    );

  if (flow === 'review' && payee)
    return (
      <div className="h-full overflow-y-auto animate-slide-in">
        <Header title="Review & confirm" back={() => setFlow('amount')} />
        <div className="p-4">
          <div className="text-center py-4">
            <div className="text-xs text-sub">You&apos;re sending</div>
            <div className="text-[34px] font-extrabold tracking-tight text-ink">S${numeric.toLocaleString()}</div>
          </div>
          <div className="bg-app-card rounded-2xl p-4 shadow-sm">
            <RevRow k="To" v={payee.name} />
            <RevRow k="Account" v={`${payee.bank} ${payee.acct}`} />
            <RevRow k="From" v={`${account?.product ?? '360 Account'} · ${account?.accountNo ?? ''}`} />
            <RevRow k="When" v="Now" last />
          </div>
          <div className="flex items-center gap-1.5 justify-center text-[10.5px] text-sub my-3">
            <ShieldIcon c="#0F9D58" size={12} /> Checked by Guardian Angel before sending
          </div>
          <button onClick={onConfirm} className="ocbc-btn">
            Confirm &amp; send
          </button>
        </div>
      </div>
    );

  if (flow === 'intercept' && payee) {
    if (phase === 'network') {
      if (!network) {
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 animate-slide-in">
            <span className="w-[66px] h-[66px] rounded-full border-4 border-ocbc-red/15 border-t-ocbc-red animate-spin-slow inline-block mb-4.5" />
            <div className="font-extrabold text-[17px] text-ink">Checking the recipient…</div>
            <div className="text-[13px] text-sub mt-1.5">This takes a moment.</div>
          </div>
        );
      }
      return <NetworkGate network={network} onProceed={onProceedNetwork} onCancel={onExit} />;
    }
    if (phase === 'assessing') {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-6 animate-slide-in">
          <span className="w-[66px] h-[66px] rounded-full border-4 border-ocbc-red/15 border-t-ocbc-red animate-spin-slow inline-block mb-4.5" />
          <div className="font-extrabold text-[17px] text-ink">Guardian Angel is reviewing…</div>
          <div className="text-[13px] text-sub mt-1.5">Just a moment.</div>
        </div>
      );
    }
    if (!result) return null;
    return (
      <Intercept
        payee={payee}
        amount={numeric}
        phase={phase}
        result={result}
        holdLabel={holdLabel}
        onCancel={onCancel}
        onRelease={onRelease}
        onExit={onExit}
      />
    );
  }

  return null;
}

// Hard safety net: keep customer-facing messages short even if the live AI over-writes.
// Takes whole sentences up to maxChars so it never cuts mid-word. Detail lives in the rail.
function clampText(s: string, maxChars: number): string {
  const text = (s ?? '').trim();
  if (text.length <= maxChars) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = '';
  for (const sent of sentences) {
    if ((out + sent).length > maxChars) break;
    out += sent;
  }
  out = out.trim();
  return out || text.slice(0, maxChars).trim() + '…';
}

function initials(name: string): string {
  return name
    .trim()
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const PALETTE = ['#1565C0', '#0F9D58', '#7B1FA2', '#9AA3AB', '#E67E22', '#16A085'];
function initialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function NetworkGate({
  network,
  onProceed,
  onCancel,
}: {
  network: NetworkCheckResult;
  onProceed: () => void;
  onCancel: () => void;
}) {
  // Customer view stays plain-language only — no confidence %, risk-tier label, source
  // badge, or raw network graph. That detail lives in the presenter rail, not here.
  const proceedsWithCaution = network.network_risk !== 'clear';
  return (
    <div className="h-full overflow-y-auto p-4 animate-slide-in">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl mb-3 bg-app-card shadow-sm">
        <ShieldCheck size={18} weight="fill" className="text-ocbc-red" />
        <div className="font-heading text-sm font-bold text-ink">Before you transfer</div>
      </div>

      <div className="bg-app-card rounded-2xl p-4 shadow-sm mb-3">
        <p className="text-[15px] leading-relaxed text-ink m-0">{clampText(network.explanation_to_grace, 120)}</p>
      </div>

      {proceedsWithCaution && network.key_signals.length > 0 && (
        <div className="bg-app-card rounded-2xl p-4 shadow-sm mb-3">
          <div className="text-[11px] font-extrabold text-sub mb-2 tracking-wide">WHY WE'RE ASKING</div>
          <ul className="space-y-1.5">
            {network.key_signals.slice(0, 3).map((s, i) => (
              <li key={i} className="text-[13px] text-ink flex gap-2">
                <span className="text-ocbc-red">•</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2.5 mt-3">
        <button onClick={onProceed} className="ocbc-btn">
          Confirm &amp; send
        </button>
        <button onClick={onCancel} className="ocbc-btn-ghost">
          Cancel
        </button>
        <div className="text-[11px] text-faint text-center">You&apos;re always in control.</div>
      </div>
    </div>
  );
}

function Intercept({
  payee,
  amount,
  phase,
  result,
  holdLabel,
  onCancel,
  onRelease,
  onExit,
}: {
  payee: Payee;
  amount: number;
  phase: Phase;
  result: AssessResult;
  holdLabel: string;
  onCancel: () => void;
  onRelease: () => void;
  onExit: () => void;
}) {
  const held = phase === 'held';
  const warned = phase === 'warned';
  const done = phase === 'cancelled' || phase === 'released' || phase === 'sent';
  const tone = held ? TIER_TONE[result.risk_tier] : warned ? '#F4A100' : '#0F9D58';
  const headline = done ? 'Guardian Angel' : held ? 'Transfer paused' : 'Just checking';

  let bodyText = result.grace_message ?? result.model_raw_text;
  if (phase === 'cancelled') {
    bodyText = 'Your money is safe. Nothing left your account.';
  } else if (phase === 'released') {
    bodyText = `Sent S$${amount.toLocaleString()} to ${payee.name}.`;
  } else if (phase === 'sent') {
    bodyText = result.grace_message ?? `Sent S$${amount.toLocaleString()} to ${payee.name}.`;
  }

  if (phase === 'sent' || phase === 'released' || phase === 'cancelled') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 animate-slide-in">
        {phase !== 'cancelled' && (
          <div className="w-[72px] h-[72px] rounded-full bg-ocbc-green/15 text-ocbc-green flex items-center justify-center mb-4 text-3xl">
            ✓
          </div>
        )}
        <div className="font-extrabold text-[19px] text-ink">{phase === 'cancelled' ? 'Transfer cancelled' : 'Transfer sent'}</div>
        <div className="text-sm text-sub mt-2 leading-relaxed max-w-[260px]">{bodyText}</div>
        <button onClick={onExit} className="mt-6 bg-ocbc-red text-white border-0 rounded-xl px-7 py-3 font-extrabold">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 animate-slide-in">
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl mb-3.5 animate-pop"
        style={{ background: `${tone}10`, border: `1.5px solid ${tone}55` }}
      >
        <ShieldIcon c={tone} size={18} />
        <div className="font-heading text-sm font-bold" style={{ color: tone }}>
          {headline}
        </div>
      </div>

      <div className="bg-app-card rounded-2xl p-4 shadow-sm">
        <p className="text-base leading-relaxed text-ink m-0">
          {phase === 'held' || phase === 'warned' ? clampText(bodyText, 200) : bodyText}
        </p>
      </div>

      {(held || warned) && result.risk_context.signals.length > 0 && (
        <div className="mt-3 bg-app-card rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-extrabold text-sub mb-2 tracking-wide">WHY WE'RE ASKING</div>
          <ul className="space-y-1.5">
            {[...result.risk_context.signals]
              .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])
              .slice(0, 3)
              .map((s) => (
                <li key={s.id} className="text-[13px] text-ink flex gap-2">
                  <span className="text-ocbc-red">•</span> {s.label}
                </li>
              ))}
          </ul>
        </div>
      )}

      {held && result.money_lock && (
        <div className="mt-3 bg-app-card rounded-2xl p-3.5 shadow-sm flex items-start gap-2.5">
          <ShieldIcon c="#ED1C24" size={16} />
          <div className="text-xs text-sub leading-relaxed">
            <b className="text-ink">
              S${result.money_lock.moved_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} moved to Money
              Lock.
            </b>{' '}
            S${result.money_lock.operating_balance_kept.toLocaleString(undefined, { minimumFractionDigits: 2 })} stays
            free for daily use.
          </div>
        </div>
      )}

      {held && (
        <div className="mt-3 bg-app-card rounded-2xl p-3.5 shadow-sm flex items-start gap-2.5">
          <HeartStraight size={16} weight="bold" className="text-ocbc-red shrink-0 mt-0.5" />
          <div className="text-xs text-sub leading-relaxed">
            <b className="text-ink">{holdLabel} safety hold.</b> OCBC will call to check in. Marcus notified.
          </div>
        </div>
      )}

      <div className="h-4" />

      {warned && (
        <div className="grid gap-2.5">
          <button onClick={onRelease} className="ocbc-btn">
            Confirm &amp; send
          </button>
          <button onClick={onCancel} className="ocbc-btn-ghost">
            Cancel
          </button>
        </div>
      )}
      {held && (
        <div className="grid gap-2.5">
          <button onClick={onCancel} className="ocbc-btn">
            Stop transfer
          </button>
          <button onClick={onRelease} className="ocbc-btn-ghost">
            Confirm &amp; send
          </button>
          <div className="text-xs text-faint text-center mt-0.5">
            Only you can release this. Marcus can&apos;t move your money.
          </div>
        </div>
      )}
    </div>
  );
}

function RevRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2.5 ${last ? '' : 'border-b border-app-line'}`}>
      <span className="text-xs text-sub">{k}</span>
      <span className="text-sm font-semibold text-ink">{v}</span>
    </div>
  );
}

function ShieldIcon({ c, size = 15 }: { c: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" fill={c} />
      <path d="M8.5 12l2.3 2.3L15.5 9.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
