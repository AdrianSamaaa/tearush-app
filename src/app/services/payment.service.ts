import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export interface PaymentReturn {
  orderId: number;
  result: 'success' | 'cancel';
}

/**
 * Runs the PayMongo hosted checkout:
 *  1. the server creates a Checkout Session and returns its URL,
 *  2. we open it in an in-app browser tab (Chrome Custom Tab on Android),
 *  3. after paying, PayMongo redirects to the server's /payments/return page,
 *     which deep-links back into the app via `tearush://payment?order=…`,
 *  4. the order page re-checks the payment with the server.
 * If the deep link doesn't fire (e.g. the user just closes the tab),
 * `browserClosed$` still prompts the order page to refresh.
 */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private router = inject(Router);
  private zone = inject(NgZone);

  readonly returned$ = new Subject<PaymentReturn>();
  readonly browserClosed$ = new Subject<void>();

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await App.addListener('appUrlOpen', ({ url }) => this.zone.run(() => this.handleDeepLink(url)));
    await Browser.addListener('browserFinished', () => this.zone.run(() => this.browserClosed$.next()));
    // App cold-started from the payment deep link.
    const launch = await App.getLaunchUrl().catch(() => undefined);
    if (launch?.url) this.zone.run(() => this.handleDeepLink(launch.url));
  }

  async openCheckout(checkoutUrl: string): Promise<void> {
    await Browser.open({ url: checkoutUrl, toolbarColor: '#3C2415' });
  }

  private handleDeepLink(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.hostname !== 'payment') return;
    const orderId = Number(parsed.searchParams.get('order'));
    const result = parsed.searchParams.get('result') === 'success' ? 'success' : 'cancel';
    void Browser.close().catch(() => undefined);
    if (!orderId) return;
    this.returned$.next({ orderId, result });
    void this.router.navigate(['/orders', orderId], { queryParams: { payment: result }, replaceUrl: true });
  }
}
