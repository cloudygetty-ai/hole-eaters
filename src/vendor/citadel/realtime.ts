import type { Http } from './http.js';
import type { PresenceMember } from './types.js';

type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (payload: any, meta: { event: string; from?: string | null }) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * One socket per client, lazily opened. Survives network loss: exponential reconnect,
 * then re-subscribes and re-announces presence. Re-sends the token after every refresh
 * so the server never closes the socket for expiry.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private channels = new Map<string, Channel>();
  private pending = new Map<string, { resolve: (m: Msg) => void; reject: (e: Error) => void }>();
  private ref = 0;
  private attempts = 0;
  private opening: Promise<void> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  private readonly http: Http;
  private readonly WS: typeof WebSocket;

  constructor(http: Http, WS: typeof WebSocket) {
    this.http = http;
    this.WS = WS;
    http.onSession((s) => {
      if (s && this.ws?.readyState === 1) void this.call({ type: 'auth', token: s.accessToken }).catch(() => {});
    });
  }

  channel(name: string): Channel {
    let ch = this.channels.get(name);
    if (!ch) this.channels.set(name, (ch = new Channel(name, this)));
    return ch;
  }

  disconnect(): void {
    this.closed = true;
    this.ws?.close();
  }

  /** @internal */
  async call(msg: Msg): Promise<Msg> {
    await this.connect();
    const ref = String(++this.ref);
    return new Promise((resolve, reject) => {
      this.pending.set(ref, { resolve, reject });
      this.ws!.send(JSON.stringify({ ...msg, ref }));
      setTimeout(() => this.pending.get(ref) && (this.pending.delete(ref), reject(new Error('realtime timeout'))), 10_000);
    });
  }

  /** @internal */
  forget(name: string) {
    this.channels.delete(name);
  }

  private connect(): Promise<void> {
    if (this.ws?.readyState === 1) return Promise.resolve();
    this.closed = false;
    this.opening ??= (async () => {
      await this.http.ready;
      const url = new URL(this.http.baseUrl.replace(/^http/, 'ws') + '/v1/realtime');
      url.searchParams.set('key', this.http.key);
      const token = await this.http.token();
      if (token) url.searchParams.set('token', token);
      const ws = new this.WS(url.toString());
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('realtime connection failed'));
      });
      this.ws = ws;
      this.attempts = 0;
      ws.onmessage = (e) => this.route(JSON.parse(String(e.data)) as Msg);
      ws.onclose = () => this.onClose();
      let beats = 0;
      this.ping = setInterval(() => {
        if (ws.readyState !== 1) return;
        ws.send('{"type":"ping"}');
        // External tokens rotate outside the SDK; re-present every ~4 min so the socket never expires.
        if (this.http.tokenProvider && ++beats % 10 === 0) {
          void this.http.token().then((t) => {
            if (t) this.call({ type: 'auth', token: t }).catch(() => {});
          });
        }
      }, 25_000);
    })().finally(() => (this.opening = null));
    return this.opening;
  }

  private route(m: Msg) {
    if (m.ref && this.pending.has(m.ref)) {
      const p = this.pending.get(m.ref)!;
      this.pending.delete(m.ref);
      return m.type === 'error' ? p.reject(new Error(`${m.code}: ${m.message}`)) : p.resolve(m);
    }
    if (m.type === 'message' || m.type === 'presence') this.channels.get(m.channel)?.dispatch(m);
    if (m.type === 'error' && m.code === 'token_expired') void this.http.refresh();
  }

  private onClose() {
    if (this.ping) clearInterval(this.ping);
    this.ws = null;
    this.pending.forEach((p) => p.reject(new Error('realtime disconnected')));
    this.pending.clear();
    if (this.closed || this.channels.size === 0) return;
    const delay = Math.min(30_000, 500 * 2 ** this.attempts++) * (0.5 + Math.random() / 2);
    setTimeout(() => {
      this.connect()
        .then(() => Promise.all([...this.channels.values()].map((c) => c.resume())))
        .catch(() => this.onClose());
    }, delay);
  }
}

export class Channel {
  private handlers = new Map<string, Set<Handler>>();
  private presenceHandlers = new Set<(e: { event: 'join' | 'update' | 'leave'; member: PresenceMember }) => void>();
  private subscribing: Promise<void> | null = null; // single-flight: concurrent callers await one ack
  private trackedState: Record<string, unknown> | null = null;

  readonly name: string;
  private readonly rt: RealtimeClient;

  constructor(name: string, rt: RealtimeClient) {
    this.name = name;
    this.rt = rt;
  }

  /** Event '*' receives everything. Returns an unsubscribe function. */
  on(event: string, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
    this.subscribe().catch(() => {});
    return () => {
      set!.delete(handler);
      if (this.listenerCount() === 0) void this.leave();
    };
  }

  onPresence(handler: (e: { event: 'join' | 'update' | 'leave'; member: PresenceMember }) => void): () => void {
    this.presenceHandlers.add(handler);
    this.subscribe().catch(() => {});
    return () => this.presenceHandlers.delete(handler);
  }

  async publish(event: string, payload: unknown): Promise<void> {
    await this.rt.call({ type: 'publish', channel: this.name, event, payload });
  }

  async track(state: Record<string, unknown>): Promise<void> {
    await this.subscribe();
    this.trackedState = state;
    await this.rt.call({ type: 'presence', channel: this.name, state });
  }

  async members(): Promise<PresenceMember[]> {
    await this.subscribe();
    return (await this.rt.call({ type: 'presence.sync', channel: this.name })).members as PresenceMember[];
  }

  async leave(): Promise<void> {
    this.subscribing = null;
    this.rt.forget(this.name);
    await this.rt.call({ type: 'unsubscribe', channel: this.name }).catch(() => {});
  }

  /** @internal */
  subscribe(): Promise<void> {
    this.subscribing ??= this.rt.call({ type: 'subscribe', channel: this.name }).then(
      () => undefined,
      (err: unknown) => {
        this.subscribing = null; // allow a later retry
        throw err;
      },
    );
    return this.subscribing;
  }

  /** @internal — after reconnect */
  async resume(): Promise<void> {
    this.subscribing = null;
    await this.subscribe();
    if (this.trackedState) await this.rt.call({ type: 'presence', channel: this.name, state: this.trackedState });
  }

  /** @internal */
  dispatch(m: Msg) {
    if (m.type === 'presence') return this.presenceHandlers.forEach((h) => h({ event: m.event, member: m.payload }));
    const meta = { event: m.event as string, from: m.from };
    this.handlers.get(m.event)?.forEach((h) => h(m.payload, meta));
    this.handlers.get('*')?.forEach((h) => h(m.payload, meta));
  }

  private listenerCount() {
    let n = this.presenceHandlers.size;
    this.handlers.forEach((s) => (n += s.size));
    return n;
  }
}
