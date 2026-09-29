import type { Transport, TransportHandlers } from './transport.ts';

export type TokenGetter = () => Promise<string | null> | string | null;

export interface WsTransportOptions {
  readonly url: string;
  readonly getToken?: TokenGetter;
}

/** Only wss is accepted in production builds so a misconfigured URL cannot silently downgrade to plaintext. */
export function isAllowedSocketUrl(url: string, production: boolean = import.meta.env.PROD): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'wss:' || (!production && parsed.protocol === 'ws:');
  } catch {
    return false;
  }
}

/**
 * Real WebSocket transport. The auth token is sent as the first frame after open rather than in the URL,
 * because URLs end up in proxy logs, browser history and Referer headers. It is only held in a local variable.
 */
export class WsTransport implements Transport {
  private readonly url: string;
  private readonly getToken: TokenGetter | undefined;
  private socket: WebSocket | null = null;
  private handlers: TransportHandlers | null = null;

  constructor(options: WsTransportOptions) {
    this.url = options.url;
    this.getToken = options.getToken;
  }

  connect(handlers: TransportHandlers): void {
    this.handlers = handlers;
    if (!isAllowedSocketUrl(this.url)) {
      queueMicrotask(() => {
        this.handlers?.onError();
        this.handlers?.onClose();
      });
      return;
    }

    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', this.handleOpen);
    socket.addEventListener('message', this.handleMessage);
    socket.addEventListener('error', this.handleError);
    socket.addEventListener('close', this.handleClose);
  }

  disconnect(): void {
    const socket = this.socket;
    this.handlers = null;
    this.socket = null;
    if (!socket) return;
    socket.removeEventListener('open', this.handleOpen);
    socket.removeEventListener('message', this.handleMessage);
    socket.removeEventListener('error', this.handleError);
    socket.removeEventListener('close', this.handleClose);
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'client disconnect');
    }
  }

  send(data: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
  }

  private readonly handleOpen = (): void => {
    void this.authenticate().then(() => {
      this.handlers?.onOpen();
    });
  };

  private async authenticate(): Promise<void> {
    if (!this.getToken) return;
    try {
      const token = await this.getToken();
      if (token) this.send(JSON.stringify({ type: 'auth', token }));
    } catch {
      // A failed token fetch is surfaced as a connection error without exposing why.
      this.handlers?.onError();
      this.socket?.close(4001, 'auth unavailable');
    }
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    this.handlers?.onMessage(event.data);
  };

  private readonly handleError = (): void => {
    this.handlers?.onError();
  };

  private readonly handleClose = (): void => {
    const handlers = this.handlers;
    this.disconnect();
    handlers?.onClose();
  };
}
