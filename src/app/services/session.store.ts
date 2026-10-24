import { Injectable, signal } from '@angular/core';

/**
 * Holds the login token on its own (no dependencies) so the HTTP interceptor
 * and the on-device backend can read it without depending on AuthService.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly token = signal<string | null>(null);
  readonly expired = signal(0);
}
