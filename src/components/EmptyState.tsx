import { Icon } from './Icon.tsx';

interface EmptyStateProps {
  readonly title: string;
  readonly hint?: string;
}

export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div className="state">
      <span className="state__icon">
        <Icon name="inbox" />
      </span>
      <p className="state__title">{title}</p>
      {hint ? <p className="state__hint">{hint}</p> : null}
    </div>
  );
}
