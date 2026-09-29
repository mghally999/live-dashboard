import type { ReactNode } from 'react';
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { logger } from '../utils/logger.ts';

interface ErrorBoundaryProps {
  readonly label: string;
  readonly children: ReactNode;
}

function handleError(): void {
  // Error details can contain stream data, so only the fact that a widget failed is recorded.
  logger.error('widget render failed');
}

/** Isolates a widget so one failure does not take down the dashboard. */
export function ErrorBoundary({ label, children }: ErrorBoundaryProps) {
  const renderFallback = ({ resetErrorBoundary }: FallbackProps) => (
    <div className="panel state state--error" role="alert">
      <p className="state__title">The {label} could not be displayed.</p>
      <button type="button" className="button button--small" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  );

  return (
    <ReactErrorBoundary fallbackRender={renderFallback} onError={handleError}>
      {children}
    </ReactErrorBoundary>
  );
}
