import { CitadelError, type KeyValueStorage, type Session } from './types.js';

const STORAGE_KEY = 'citadel.session';

export type TokenProvider = () => Promise<string | null> | string | null;

/**
 * Transport + session owner. Injects the API key and bearer token, and transparently
 * refreshes once on 401. Concurrent 401s share one refresh (single-flight).
 */
export class Http {
  private session: Session | null = null;
  private refreshing: Promise<Session | null> | null = null;
  private listeners = new Set<(s: Session | null) => void>();
  readonly ready: Promise<void>;

  readonly baseUrl: string;
  readonly key: string;
  private readonly storage: KeyValueStorage;
  private readonly fetchImpl: typeof fetch;
  /** Bring-your-own-auth: called before every request (e.g. Supabase's current access token). */
  readonly tokenProvider?: TokenProvider;

  constructor(baseUrl: string, key: string, storage: KeyValueStorage, fetchImpl: typeof fetch, tokenProvider?: TokenProvider) {
    this.baseUrl = baseUrl;
    this.key = key;
    this.storage = storage;
    this.fetchImpl = fetchImpl;
    this.tokenProvider = tokenProvider;
    this.ready = Promise.resolve(storage.getItem(STORAGE_KEY)).then((raw) => {
      if (raw) this.session = JSON.parse(raw) as Session;
    });
  }

  get current(): Session | null {
    return this.session;
  }

  onSession(cb: (s: Session | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async setSession(s: Session | null): Promise<void> {
    this.session = s;
    await (s ? this.storage.setItem(STORAGE_KEY, JSON.stringify(s)) : this.storage.removeItem(STORAGE_KEY));
    this.listeners.forEach((l) => l(s));
  }

  async request<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<T> {
    await this.ready;
    const res = await this.send(method, path, body, opts.auth !== false);
    if (res.status === 401 && opts.auth !== false) {
      // External IdPs refresh their own tokens; asking the provider again picks up the new one.
      if (this.tokenProvider) return this.parse<T>(await this.send(method, path, body, true));
      if (this.session && (await this.refresh())) return this.parse<T>(await this.send(method, path, body, true));
    }
    return this.parse<T>(res);
  }

  /** The bearer token to present right now, from the provider or the stored session. */
  async token(): Promise<string | null> {
    if (this.tokenProvider) return (await this.tokenProvider()) ?? null;
    await this.ready;
    return this.session?.accessToken ?? null;
  }

  refresh(): Promise<Session | null> {
    this.refreshing ??= (async () => {
      const token = this.session?.refreshToken;
      if (!token) return null;
      const res = await this.send('POST', '/v1/auth/refresh', { refreshToken: token }, false);
      const next = res.ok ? ((await res.json()) as Session) : null;
      await this.setSession(next); // null → signed out (expired or reuse-revoked)
      return next;
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async send(method: string, path: string, body: unknown, auth: boolean): Promise<Response> {
    const headers: Record<string, string> = { 'x-citadel-key': this.key };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = auth ? await this.token() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    return this.fetchImpl(this.baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = res.status === 204 ? '' : await res.text();
    let json: { error?: { code: string; message: string; details?: unknown } } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (proxy error page) — surfaced via statusText below */
    }
    if (!res.ok) {
      throw new CitadelError(res.status, json?.error?.code ?? 'http_error', json?.error?.message ?? res.statusText, json?.error?.details);
    }
    return (json ?? undefined) as T;
  }
}

export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
