import type { Http } from './http.js';
import type { Session, User } from './types.js';

export class AuthClient {
  private readonly http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  async signUp(email: string, password: string): Promise<User> {
    const s = await this.http.request<Session>('POST', '/v1/auth/signup', { email, password }, { auth: false });
    await this.http.setSession(s);
    return s.user;
  }

  async signIn(email: string, password: string): Promise<User> {
    const s = await this.http.request<Session>('POST', '/v1/auth/login', { email, password }, { auth: false });
    await this.http.setSession(s);
    return s.user;
  }

  /** Revokes server-side even if the network call fails locally. */
  async signOut(): Promise<void> {
    const token = this.http.current?.refreshToken;
    await this.http.setSession(null);
    if (token) await this.http.request('POST', '/v1/auth/logout', { refreshToken: token }, { auth: false }).catch(() => {});
  }

  async user(): Promise<User | null> {
    await this.http.ready;
    return this.http.current?.user ?? null;
  }

  async me(): Promise<User> {
    return this.http.request<User>('GET', '/v1/auth/me');
  }

  async updateMetadata(metadata: Record<string, unknown>): Promise<User> {
    return this.http.request<User>('PATCH', '/v1/auth/me', { metadata });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.http.setSession(await this.http.request<Session>('POST', '/v1/auth/password', { currentPassword, newPassword }));
  }

  /**
   * Native Sign in with Apple/Google: pass the id_token from expo-apple-authentication,
   * @react-native-google-signin, or Google Identity Services. Pass the RAW nonce if you used one.
   */
  async signInWithIdToken(provider: 'apple' | 'google', idToken: string, nonce?: string): Promise<User & { isNew: boolean }> {
    const s = await this.http.request<Session & { created: boolean }>('POST', `/v1/auth/oauth/${provider}`, { idToken, nonce }, { auth: false });
    await this.http.setSession(s);
    return { ...s.user, isNew: s.created };
  }

  /** Re-sends the verification email for the signed-in user. */
  requestEmailVerification(): Promise<void> {
    return this.http.request('POST', '/v1/auth/verify/request');
  }

  /** Call from the screen your verifyUrl opens, with its `token` query param. */
  async confirmEmail(token: string): Promise<void> {
    await this.http.request('POST', '/v1/auth/verify/confirm', { token }, { auth: false });
    if (this.http.current) await this.http.setSession({ ...this.http.current, user: await this.me() });
  }

  /** Always resolves the same way, whether or not the account exists. */
  forgotPassword(email: string): Promise<void> {
    return this.http.request('POST', '/v1/auth/password/forgot', { email }, { auth: false });
  }

  /** Completes a reset from the resetUrl deep link; signs the user in. */
  async resetPassword(token: string, newPassword: string): Promise<User> {
    const s = await this.http.request<Session>('POST', '/v1/auth/password/reset', { token, newPassword }, { auth: false });
    await this.http.setSession(s);
    return s.user;
  }

  /** Fires on sign in, sign out, token refresh and forced revocation. */
  onChange(cb: (user: User | null) => void): () => void {
    return this.http.onSession((s) => cb(s?.user ?? null));
  }
}
