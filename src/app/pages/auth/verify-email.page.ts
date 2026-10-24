import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonSpinner,
  IonIcon,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailUnreadOutline, informationCircleOutline, alertCircleOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../services/api.service';

addIcons({
  'mail-unread-outline': mailUnreadOutline,
  'information-circle-outline': informationCircleOutline,
  'alert-circle-outline': alertCircleOutline,
});

const RESEND_SECONDS = 60;

@Component({
  selector: 'app-verify-email',
  standalone: true,
  templateUrl: './verify-email.page.html',
  styleUrls: ['./auth.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonContent,
    IonItem,
    IonInput,
    IonButton,
    IonSpinner,
    IonIcon,
  ],
})
export class VerifyEmailPage {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastCtrl = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  code = '';
  readonly busy = signal(false);
  readonly resending = signal(false);
  readonly error = signal<string | null>(null);
  readonly cooldown = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    this.destroyRef.onDestroy(() => clearInterval(this.timer));
  }

  get returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('/verify-email') ? url : '/dashboard';
  }

  ionViewWillEnter(): void {
    if (!this.auth.isLoggedIn()) {
      void this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }
    if (!this.auth.needsVerification()) {
      void this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
      return;
    }
    if (this.auth.lastVerification()) this.startCooldown();
  }

  useDemoCode(): void {
    this.code = this.auth.lastVerification()?.devCode ?? '';
  }

  async verify(): Promise<void> {
    const code = this.code.replace(/\D/g, '');
    if (code.length !== 6) {
      this.error.set('Enter the 6-digit code from your email.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.verifyEmail(code);
      const toast = await this.toastCtrl.create({ message: 'Email verified ✓', duration: 1600, color: 'tertiary', position: 'bottom' });
      await toast.present();
      await this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    this.resending.set(true);
    this.error.set(null);
    try {
      const info = await this.auth.resendVerification();
      this.code = '';
      this.startCooldown();
      if (!info.error) {
        const toast = await this.toastCtrl.create({ message: `New code sent to ${info.sentTo}`, duration: 1800, color: 'medium', position: 'bottom' });
        await toast.present();
      }
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.resending.set(false);
    }
  }

  private startCooldown(): void {
    clearInterval(this.timer);
    this.cooldown.set(RESEND_SECONDS);
    this.timer = setInterval(() => {
      this.cooldown.update((s) => Math.max(0, s - 1));
      if (this.cooldown() === 0) clearInterval(this.timer);
    }, 1000);
  }
}
