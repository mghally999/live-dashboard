import { memo } from 'react';

export type KpiTone = 'default' | 'accent' | 'warning' | 'critical';

interface KpiCardProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: KpiTone;
}

/** Props are preformatted strings, so memo skips the render whenever the displayed text is unchanged. */
export const KpiCard = memo(function KpiCard({ label, value, hint, tone = 'default' }: KpiCardProps) {
  return (
    <li className={`kpi kpi--${tone}`}>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </li>
  );
});
