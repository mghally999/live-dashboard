interface LoadingProps {
  readonly label?: string;
}

export function Loading({ label = 'Connecting to the stream' }: LoadingProps) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
