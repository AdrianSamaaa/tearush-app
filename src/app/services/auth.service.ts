import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User, VerificationInfo } from '../models/user.model';
import { ApiService, isNetworkError } from './api.service';
import { StorageService } from './storage.service';
import { SessionStore } from './session.store';

export { SessionStore } from './session.store';

const TOKEN_KEY = 'tearush_token';
const USER_KEY = 'tearush_user';
const VERIFICATION_KEY = 'tearush_last_verification';

interface AuthResponse {
  token: string;
  user: User;
  verification?: VerificationInfo;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private storage = inject(StorageService);
  private session = inject(SessionStore);
  private router = inject(Router);

  private readonly _user = signal<User | null>(null);

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null && this.session.token() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'admin');
  readonly firstName = computed(() => this._user()?.name.split(' ')[0] ?? null);
  readonly needsVerification = computed(() => this._user()?.emailVerified === false);
  /** Result of the last verification email (shown on the Verify Email page). */
  readonly lastVerification = signal<VerificationInfo | null>(null);

  /** Restores the saved session, then refreshes the profile in the background. */
  async init(): Promise<void> {
    const [token, user, verification] = await Promise.all([
      this.storage.get<string>(TOKEN_KEY),
      this.storage.get<User>(USER_KEY),
      this.storage.get<VerificationInfo>(VERIFICATION_KEY),
    ]);
    if (token && user) {
      this.session.token.set(token);
      this._user.set(user);
      if (user.emailVerified === false && verification) this.lastVerification.set(verification);
      void this.refreshProfile();
    }
  }

  private async rememberVerification(info: VerificationInfo | null): Promise<void> {
    this.lastVerification.set(info);
    await (info ? this.storage.set(VERIFICATION_KEY, info) : this.storage.remove(VERIFICATION_KEY));
  }

  async refreshProfile(): Promise<void> {
    if (!this.session.token()) return;
    try {
      const { user } = await this.api.get<{ user: User }>('/auth/me');
      await this.setUser(user);
    } catch (err) {
      // Network problems keep the cached session; a 401 is handled by the interceptor.
      if (!isNetworkError(err)) console.warn('Could not refresh profile', err);
    }
  }

  async login(email: string, password: string): Promise<User> {
    const res = await this.api.post<AuthResponse>('/auth/login', { email, password });
    await this.startSession(res);
    return res.user;
  }

  async register(input: { name: string; email: string; phone: string; password: string }): Promise<User> {
    const res = await this.api.post<AuthResponse>('/auth/register', input);
    await this.startSession(res);
    await this.rememberVerification(res.verification ?? null);
    return res.user;
  }

  async updateProfile(input: { name: string; email: string; phone: string }): Promise<User> {
    const { user, verification } = await this.api.put<{ user: User; verification?: VerificationInfo }>('/auth/me', input);
    await this.setUser(user);
    if (verification) await this.rememberVerification(verification);
    return user;
  }

  async verifyEmail(code: string): Promise<User> {
    const { user } = await this.api.post<{ user: User }>('/auth/verify-email', { code });
    await this.setUser(user);
    await this.rememberVerification(null);
    return user;
  }

  async resendVerification(): Promise<VerificationInfo> {
    const { verification } = await this.api.post<{ verification: VerificationInfo }>('/auth/resend-verification');
    await this.rememberVerification(verification);
    return verification;
  }

  /** Saves a profile photo (data URL), or removes it with `null`. */
  async updateAvatar(avatar: string | null): Promise<User> {
    const { user } = await this.api.put<{ user: User }>('/auth/me/avatar', { avatar });
    await this.setUser(user);
    return user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.api.put('/auth/password', { currentPassword, newPassword });
  }

  async deleteAccount(password: string): Promise<void> {
    await this.api.delete('/auth/me', { password });
    await this.clearSession();
  }

  async logout(): Promise<void> {
    await this.clearSession();
    await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }

  /** Called by the interceptor when the server rejects our token. */
  async handleExpiredSession(): Promise<void> {
    if (!this.session.token()) return;
    await this.clearSession();
    this.session.expired.update((n) => n + 1);
  }

  private async startSession({ token, user }: AuthResponse): Promise<void> {
    this.session.token.set(token);
    await Promise.all([this.storage.set(TOKEN_KEY, token), this.setUser(user)]);
  }

  private async setUser(user: User): Promise<void> {
    this._user.set(user);
    await this.storage.set(USER_KEY, user);
  }

  private async clearSession(): Promise<void> {
    this.session.token.set(null);
    this._user.set(null);
    this.lastVerification.set(null);
    await Promise.all([this.storage.remove(TOKEN_KEY), this.storage.remove(USER_KEY), this.storage.remove(VERIFICATION_KEY)]);
  }
}
