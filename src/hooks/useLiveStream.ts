import { useEffect, useMemo, useRef } from 'react';
import { STREAM_URL } from '../config.ts';
import { MockTransport } from '../services/mockTransport.ts';
import { StreamClient } from '../services/streamClient.ts';
import type { TransportFactory } from '../services/transport.ts';
import { WsTransport, type TokenGetter } from '../services/wsTransport.ts';
import type { LiveStore } from '../store/liveStore.ts';

export interface LiveStreamActions {
  readonly pause: () => void;
  readonly resume: () => void;
  readonly retry: () => void;
}

export interface LiveStreamOptions {
  /** Wire this to a short lived session endpoint in production. Never read tokens from env or storage. */
  readonly getToken?: TokenGetter;
}

function createTransportFactory(store: LiveStore, options: LiveStreamOptions): TransportFactory {
  if (STREAM_URL) {
    return () => new WsTransport({ url: STREAM_URL, ...(options.getToken ? { getToken: options.getToken } : {}) });
  }
  return () => new MockTransport({ getRate: () => store.getSettings().rate });
}

/**
 * Connects the stream client to the store for the lifetime of the component. All connection logic lives in
 * services; this hook only wires it up and exposes stable actions.
 */
export function useLiveStream(store: LiveStore, options: LiveStreamOptions = {}): LiveStreamActions {
  const clientRef = useRef<StreamClient | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    // A fresh client per effect run keeps StrictMode's mount, unmount, mount cycle leak free.
    const client = new StreamClient({
      createTransport: createTransportFactory(store, optionsRef.current),
      callbacks: {
        onEvent: (event) => { store.ingest(event); },
        onMalformed: () => { store.recordMalformed(); },
        onConnection: (state) => { store.setConnection(state); },
      },
    });
    clientRef.current = client;
    const stopStore = store.start();
    client.setPaused(store.getSnapshot().pause.paused);
    store.setConnection(client.getState());
    client.start();

    return () => {
      client.stop();
      stopStore();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [store]);

  return useMemo<LiveStreamActions>(
    () => ({
      pause: () => {
        store.setPaused(true);
        clientRef.current?.setPaused(true);
      },
      resume: () => {
        store.setPaused(false);
        clientRef.current?.setPaused(false);
      },
      retry: () => {
        clientRef.current?.retry();
      },
    }),
    [store],
  );
}
