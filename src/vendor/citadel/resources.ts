import type { Http } from './http.js';
import type { RealtimeClient } from './realtime.js';
import { CitadelError, type DataRecord, type FileMeta, type Page } from './types.js';

export interface ListOptions<T> {
  where?: Partial<T>;
  limit?: number;
  cursor?: string;
  order?: 'asc' | 'desc';
}

export type ChangeEvent<T> = { op: 'insert' | 'update' | 'delete'; record: DataRecord<T> | { id: string; truncated: true } };

export class Collection<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  private readonly http: Http;
  private readonly rt: RealtimeClient;

  constructor(name: string, http: Http, rt: RealtimeClient) {
    this.name = name;
    this.http = http;
    this.rt = rt;
  }

  list(opts: ListOptions<T> = {}): Promise<Page<DataRecord<T>>> {
    const qs = new URLSearchParams();
    if (opts.where) qs.set('where', JSON.stringify(opts.where));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.cursor) qs.set('cursor', opts.cursor);
    if (opts.order) qs.set('order', opts.order);
    return this.http.request('GET', `/v1/data/${this.name}?${qs}`);
  }

  /** Walks every page. Prefer `list` for UI; use this for exports/sync. */
  async *all(opts: Omit<ListOptions<T>, 'cursor'> = {}): AsyncGenerator<DataRecord<T>> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...opts, cursor });
      yield* page.items;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  get(id: string): Promise<DataRecord<T>> {
    return this.http.request('GET', `/v1/data/${this.name}/${id}`);
  }
  create(data: T): Promise<DataRecord<T>> {
    return this.http.request('POST', `/v1/data/${this.name}`, { data });
  }
  update(id: string, patch: Partial<T>): Promise<DataRecord<T>> {
    return this.http.request('PATCH', `/v1/data/${this.name}/${id}`, { data: patch });
  }
  replace(id: string, data: T): Promise<DataRecord<T>> {
    return this.http.request('PUT', `/v1/data/${this.name}/${id}`, { data });
  }
  delete(id: string): Promise<void> {
    return this.http.request('DELETE', `/v1/data/${this.name}/${id}`);
  }

  /** Live change feed, filtered server-side by the collection's read rule. */
  subscribe(cb: (e: ChangeEvent<T>) => void): () => void {
    return this.rt.channel(`db:${this.name}`).on('*', (record, meta) => cb({ op: meta.event as ChangeEvent<T>['op'], record }));
  }
}

export class StorageClient {
  private readonly http: Http;
  private readonly fetchImpl: typeof fetch;

  constructor(http: Http, fetchImpl: typeof fetch) {
    this.http = http;
    this.fetchImpl = fetchImpl;
  }

  /** create → direct PUT to the bucket → complete. Bytes never pass through the API. */
  async upload(
    body: Blob | ArrayBuffer | Uint8Array,
    opts: { filename: string; contentType: string; visibility?: 'public' | 'private' },
  ): Promise<FileMeta> {
    const size = body instanceof Blob ? body.size : body.byteLength;
    const { file, upload } = await this.http.request<{ file: FileMeta; upload: { url: string; headers: Record<string, string> } }>(
      'POST', '/v1/storage/uploads', { ...opts, size },
    );
    const put = await this.fetchImpl(upload.url, { method: 'PUT', headers: upload.headers, body: body as BodyInit });
    if (!put.ok) throw new CitadelError(put.status, 'upload_failed', `Bucket rejected upload (${put.status})`);
    return this.http.request('POST', `/v1/storage/files/${file.id}/complete`);
  }

  get(id: string): Promise<FileMeta> {
    return this.http.request('GET', `/v1/storage/files/${id}`);
  }
  list(limit = 50): Promise<{ items: FileMeta[] }> {
    return this.http.request('GET', `/v1/storage/files?limit=${limit}`);
  }
  delete(id: string): Promise<void> {
    return this.http.request('DELETE', `/v1/storage/files/${id}`);
  }
}

export class PushClient {
  private readonly http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  /** Call after the OS grants permission and on every launch (tokens rotate). */
  register(platform: 'ios' | 'android' | 'web', token: string): Promise<void> {
    return this.http.request('POST', '/v1/push/devices', { platform, token });
  }
  unregister(token: string): Promise<void> {
    return this.http.request('DELETE', '/v1/push/devices', { token });
  }
}
