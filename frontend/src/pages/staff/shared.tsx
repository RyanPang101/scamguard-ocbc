import type { RegistryStatus, ReviewStatus, RiskTier } from '../../types';

const RISK_TONE: Record<RiskTier, { fg: string; bg: string }> = {
  LOW: { fg: '#059669', bg: '#ECFDF5' },
  MEDIUM: { fg: '#D97706', bg: '#FFFBEB' },
  HIGH: { fg: '#EA580C', bg: '#FFF7ED' },
  CRITICAL: { fg: '#DC2626', bg: '#FEF2F2' },
};

export function RiskBadge({ level }: { level: RiskTier }) {
  const tone = RISK_TONE[level] ?? RISK_TONE.LOW;
  return (
    <span
      className="text-[10.5px] font-extrabold px-2.5 py-1 rounded-full"
      style={{ color: tone.fg, background: tone.bg }}
    >
      {level}
    </span>
  );
}

const REGISTRY_TONE: Record<RegistryStatus, { fg: string; bg: string; label: string }> = {
  blacklisted: { fg: '#DC2626', bg: '#FEF2F2', label: 'Blacklisted' },
  watchlist: { fg: '#D97706', bg: '#FFFBEB', label: 'Watchlist' },
  cleared: { fg: '#059669', bg: '#ECFDF5', label: 'Cleared' },
  unknown: { fg: '#64748B', bg: '#F1F5F9', label: 'Unknown' },
};

export function RegistryStatusBadge({ status }: { status: RegistryStatus }) {
  const t = REGISTRY_TONE[status] ?? REGISTRY_TONE.unknown;
  return (
    <span className="text-[10.5px] font-extrabold px-2.5 py-1 rounded-full" style={{ color: t.fg, background: t.bg }}>
      {t.label}
    </span>
  );
}

const REVIEW_TONE: Record<ReviewStatus, { fg: string; bg: string; label: string }> = {
  open: { fg: '#4F46E5', bg: '#EEF2FF', label: 'Open' },
  under_review: { fg: '#0891B2', bg: '#ECFEFF', label: 'Under review' },
  confirmed_scam: { fg: '#DC2626', bg: '#FEF2F2', label: 'Confirmed scam' },
  marked_safe: { fg: '#059669', bg: '#ECFDF5', label: 'Marked safe' },
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const t = REVIEW_TONE[status] ?? REVIEW_TONE.open;
  return (
    <span className="text-[10.5px] font-extrabold px-2.5 py-1 rounded-full" style={{ color: t.fg, background: t.bg }}>
      {t.label}
    </span>
  );
}
