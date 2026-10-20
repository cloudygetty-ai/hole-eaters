export interface User {
  id: string;
  email: string | null; // null for Apple users who hid their email
  emailVerified: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface DataRecord<T = Record<string, unknown>> {
  id: string;
  ownerId: string | null;
  data: T;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface FileMeta {
  id: string;
  ownerId: string | null;
  filename: string;
  contentType: string;
  size: number;
  visibility: 'public' | 'private';
  status: 'pending' | 'ready';
  createdAt: string;
  url?: string | null;
}

export interface PresenceMember {
  connId: string;
  userId: string | null;
  state: Record<string, unknown>;
}

/** Matches localStorage and @react-native-async-storage/async-storage. */
export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export class CitadelError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'CitadelError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
