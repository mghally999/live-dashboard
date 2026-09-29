import { memo } from 'react';

export const Brand = memo(function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 13h4l2-5.5 3.5 10 2.5-7 1.5 2.5h5.5" />
        </svg>
      </span>
      <span className="brand__name">Live Monitoring</span>
    </div>
  );
});
