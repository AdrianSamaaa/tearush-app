import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage.service';
import { LocalBackend } from './local-backend';
import { SessionStore } from './session.store';

const API_URL_KEY = 'tearush_api_url';
const REQUEST_TIMEOUT_MS = 20_000;

/** Turns any HTTP/API failure into a message that can be shown to the customer. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return "Can't reach the TeaRush server. Check your internet connection and try again.";
    if (typeof err.error?.error === 'string') return err.error.error;
    return `Server error (${err.status}). Please try again.`;
  }
  if (err instanceof Error && err.name === 'TimeoutError') return 'The server took too long to respond. Please try again.';
  return 'Something went wrong. Please try again.';
}

export function isNetworkError(err: unknown): boolean {
  return (err instanceof HttpErrorResponse && err.status === 0) || (err instanceof Error && err.name === 'TimeoutError');
}

/**
 * Promise-based access to the TeaRush API.
 *
 * Two modes:
 *  - **server**: `baseUrl` is set (e.g. https://tearush-api.onrender.com) → real HTTP calls.
 *  - **device**: `baseUrl` is empty → calls are answered by LocalBackend, an on-device
 *    database, so the app works without any server (cash orders only).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private local = inject(LocalBackend);
  private session = inject(SessionStore);
  private injector = inject(Injector);

  /** Server base URL, or '' for the on-device database. */
  readonly baseUrl = signal(environment.apiUrl);
  readonly mode = computed<'server' | 'device'>(() => (this.baseUrl() ? 'server' : 'device'));

  async init(): Promise<void> {
    const saved = await this.storage.get<string>(API_URL_KEY);
    if (saved !== null) this.baseUrl.set(saved);
  }

  /** Switches server. '' = on-device database; `null` = back to the built-in default. */
  async setBaseUrl(url: string | null): Promise<void> {
    if (url === null) {
      this.baseUrl.set(environment.apiUrl);
      await this.storage.remove(API_URL_KEY);
      return;
    }
    const clean = url.trim().replace(/\/+$/, '');
    this.baseUrl.set(clean);
    await this.storage.set(API_URL_KEY, clean);
  }

  get defaultUrl(): string {
    return environment.apiUrl;
  }

  /** True if `url` points at this API (used by the auth interceptor). */
  isApiUrl(url: string): boolean {
    return this.mode() === 'server' && url.startsWith(`${this.baseUrl()}/api/`);
  }

  url(path: string): string {
    return `${this.baseUrl()}/api${path}`;
  }

  get<T>(path: string, params?: Record<string, string>): Promise<T> {
    if (this.mode() === 'device') return this.viaDevice('GET', path, undefined, params);
    return this.run(this.http.get<T>(this.url(path), { params: params ? new HttpParams({ fromObject: params }) : undefined }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    if (this.mode() === 'device') return this.viaDevice('POST', path, body);
    return this.run(this.http.post<T>(this.url(path), body));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    if (this.mode() === 'device') return this.viaDevice('PUT', path, body);
    return this.run(this.http.put<T>(this.url(path), body));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    if (this.mode() === 'device') return this.viaDevice('PATCH', path, body);
    return this.run(this.http.patch<T>(this.url(path), body));
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    if (this.mode() === 'device') return this.viaDevice('DELETE', path, body);
    return this.run(this.http.delete<T>(this.url(path), { body }));
  }

  /** Checks that `url` is a reachable TeaRush server ('' = on-device, always available). */
  async ping(url = this.baseUrl()): Promise<boolean> {
    if (!url) return true;
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string }>(`${url.replace(/\/+$/, '')}/api/health`).pipe(timeout(8000))
      );
      return res?.status === 'ok';
    } catch {
      return false;
    }
  }

  private async viaDevice<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    try {
      return (await this.local.handle(method, path, body, params)) as T;
    } catch (err) {
      const isLogin = path === '/auth/login' || path === '/auth/register';
      if (err instanceof HttpErrorResponse && err.status === 401 && this.session.token() && !isLogin) {
        // Same behaviour as the HTTP interceptor: drop the stale session.
        const { AuthService } = await import('./auth.service');
        void this.injector.get(AuthService).handleExpiredSession();
      }
      throw err;
    }
  }

  private run<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout(REQUEST_TIMEOUT_MS)));
  }
}
