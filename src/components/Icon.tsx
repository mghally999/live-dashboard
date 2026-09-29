import { memo } from 'react';

export type IconName =
  | 'pause'
  | 'play'
  | 'search'
  | 'inbox'
  | 'error';

// Hand drawn 24x24 strokes, kept tiny so no icon library is needed.
const PATHS: Readonly<Record<IconName, string>> = {
  pause: 'M9 5v14m6-14v14',
  play: 'M7 5v14l12-7L7 5Z',
  search: 'm20 20-4.2-4.2M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
  inbox: 'M4 13h4l1.5 3h5l1.5-3h4M5.5 6h13L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5l1.5-7Z',
  error: 'M15 9l-6 6m0-6 6 6m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
};

interface IconProps {
  readonly name: IconName;
  readonly className?: string;
}

export const Icon = memo(function Icon({ name, className = 'icon' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
});
