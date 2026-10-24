import { Injectable, NgZone, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Network } from '@capacitor/network';
import { SplashScreen } from '@capacitor/splash-screen';
import { Subject } from 'rxjs';

/** Device integrations: connectivity, app lifecycle, splash screen, haptics, clipboard. */
@Injectable({ providedIn: 'root' })
export class NativeService {
  private zone = inject(NgZone);

  readonly isNative = Capacitor.isNativePlatform();
  readonly online = signal(true);
  /** Emits when the app comes back to the foreground. */
  readonly resumed$ = new Subject<void>();
  /** Emits when connectivity is restored. */
  readonly reconnected$ = new Subject<void>();

  async init(): Promise<void> {
    try {
      const status = await Network.getStatus();
      this.online.set(status.connected);
      await Network.addListener('networkStatusChange', ({ connected }) =>
        this.zone.run(() => {
          const wasOffline = !this.online();
          this.online.set(connected);
          if (connected && wasOffline) this.reconnected$.next();
        })
      );
    } catch {
      /* Network plugin unavailable — assume online */
    }

    if (this.isNative) {
      await App.addListener('resume', () => this.zone.run(() => this.resumed$.next()));
    }
  }

  async hideSplash(): Promise<void> {
    if (this.isNative) await SplashScreen.hide().catch(() => undefined);
  }

  tap(): void {
    if (this.isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }

  success(): void {
    if (this.isNative) void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  }

  async copy(text: string): Promise<void> {
    try {
      await Clipboard.write({ string: text });
    } catch {
      await navigator.clipboard?.writeText(text).catch(() => undefined);
    }
  }

  exitApp(): void {
    if (this.isNative) void App.exitApp();
  }
}
