import { memo } from 'react';
import { Icon, type IconName } from './Icon.tsx';

export type KpiTone = 'default' | 'accent' | 'warning' | 'critical';

interface KpiCardProps {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly hint?: string;
  readonly tone?: KpiTone;
  readonly hero?: boolean;
  readonly live?: boolean;
}

/** Props are preformatted strings and flags, so memo skips the render whenever the displayed text is unchanged. */
export const KpiCard = memo(function KpiCard({
  label,
  value,
  icon,
  hint,
  tone = 'default',
  hero = false,
  live = false,
}: KpiCardProps) {
  return (
    <li className={`kpi kpi--${tone}${hero ? ' kpi--hero' : ''}`}>
      <div className="kpi__top">
        <span className="kpi__icon">
          <Icon name={icon} />
        </span>
        <span className="kpi__label">{label}</span>
        {live ? <span className="kpi__live" aria-hidden="true" /> : null}
      </div>
      <span className="kpi__value">{value}</span>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </li>
  );
});
