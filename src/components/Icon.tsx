import { memo } from 'react';

export type IconName =
  | 'pulse'
  | 'bolt'
  | 'layers'
  | 'alert'
  | 'warning'
  | 'clock'
  | 'signal'
  | 'pause'
  | 'play'
  | 'search'
  | 'inbox'
  | 'error';

// Hand drawn 24x24 strokes, kept tiny so no icon library is needed.
const PATHS: Readonly<Record<IconName, string>> = {
  pulse: 'M3 12h4l2.5-6 4 12 2.5-6H21',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z',
  layers: 'm12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 16l8 4 8-4',
  alert: 'M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z',
  warning: 'M12 7v6m0 3.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  signal: 'M5 18v-3m5 3v-7m5 7V8m5 10V5',
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
