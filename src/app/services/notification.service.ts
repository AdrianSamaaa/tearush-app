import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StorageService } from './storage.service';

const PREF_KEY = 'tearush_notifications';
const CHANNEL_ID = 'orders';

/** Order-update notifications shown by the app itself (no Firebase needed). */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private storage = inject(StorageService);
  private router = inject(Router);
  private zone = inject(NgZone);

  readonly enabled = signal(true);
  readonly supported = Capacitor.isNativePlatform();

  async init(): Promise<void> {
    const saved = await this.storage.get<boolean>(PREF_KEY);
    if (saved !== null) this.enabled.set(saved);
    if (!this.supported) return;

    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Order updates',
        description: 'Payment confirmations and order status changes',
        importance: 4,
        visibility: 1,
      });
      await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const orderId = notification.extra?.orderId;
        if (orderId) this.zone.run(() => this.router.navigate(['/orders', orderId]));
      });
    } catch (err) {
      console.warn('Notifications unavailable', err);
    }
  }

  /** Turns notifications on/off. Returns false if the user denied the Android permission. */
  async setEnabled(on: boolean): Promise<boolean> {
    if (on && this.supported) {
      const granted = await this.ensurePermission();
      if (!granted) {
        this.enabled.set(false);
        await this.storage.set(PREF_KEY, false);
        return false;
      }
    }
    this.enabled.set(on);
    await this.storage.set(PREF_KEY, on);
    return true;
  }

  async notify(title: string, body: string, orderId?: number): Promise<void> {
    if (!this.supported || !this.enabled()) return;
    try {
      if (!(await this.ensurePermission())) return;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_000_000_000),
            title,
            body,
            channelId: CHANNEL_ID,
            smallIcon: 'ic_stat_tearush',
            iconColor: '#C6873F',
            extra: orderId ? { orderId } : undefined,
          },
        ],
      });
    } catch (err) {
      console.warn('Could not show notification', err);
    }
  }

  private async ensurePermission(): Promise<boolean> {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      ({ display } = await LocalNotifications.requestPermissions());
    }
    return display === 'granted';
  }
}
