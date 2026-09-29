export interface TransportHandlers {
  onOpen(): void;
  /** Typed unknown on purpose: the transport does not vouch for anything it receives. */
  onMessage(raw: unknown): void;
  /** Fires once per connection, after onError when the connection failed. */
  onClose(): void;
  onError(): void;
}

/** One instance per connection attempt, which keeps teardown simple: a disconnected transport is discarded. */
export interface Transport {
  connect(handlers: TransportHandlers): void;
  disconnect(): void;
  send(data: string): void;
}

export type TransportFactory = () => Transport;
