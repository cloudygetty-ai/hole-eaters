import { AuthClient } from './auth.js';
import { Http, memoryStorage } from './http.js';
import { RealtimeClient } from './realtime.js';
import { Collection, PushClient, StorageClient } from './resources.js';
import type { KeyValueStorage } from './types.js';

export interface CitadelOptions {
  url: string;
  /** Publishable key (ck_pub_...). Never ship a secret key in a client. */
  key: string;
  /** localStorage on web, AsyncStorage on React Native. Defaults to in-memory. */
  storage?: KeyValueStorage;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  /**
   * Use an existing auth provider instead of Citadel accounts, e.g.
   * `async () => (await supabase.auth.getSession()).data.session?.access_token ?? null`.
   * The app must have `settings.externalAuth` configured server-side.
   */
  accessToken?: () => Promise<string | null> | string | null;
}

export function createClient(opts: CitadelOptions) {
  if (opts.key.startsWith('ck_sec_') && typeof window !== 'undefined') {
    console.warn('[citadel] A secret key is running in a browser/app context. Use a publishable key.');
  }
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const http = new Http(opts.url.replace(/\/$/, ''), opts.key, opts.storage ?? memoryStorage(), fetchImpl, opts.accessToken);
  const realtime = new RealtimeClient(http, opts.WebSocket ?? globalThis.WebSocket);

  return {
    auth: new AuthClient(http),
    collection: <T extends Record<string, unknown> = Record<string, unknown>>(name: string) => new Collection<T>(name, http, realtime),
    storage: new StorageClient(http, fetchImpl),
    push: new PushClient(http),
    realtime,
    channel: (name: string) => realtime.channel(name),
  };
}

export type CitadelClient = ReturnType<typeof createClient>;
export * from './types.js';
export type { Channel } from './realtime.js';
export type { ChangeEvent, Collection, ListOptions } from './resources.js';
