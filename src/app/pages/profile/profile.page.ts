import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonItem,
  IonInput,
  IonInputPasswordToggle,
  IonButton,
  IonSpinner,
  IonIcon,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, person, trashOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../services/api.service';
import { squareImageDataUrl } from '../../core/image';

addIcons({ 'camera-outline': cameraOutline, person, 'trash-outline': trashOutline });

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  imports: [
    RouterLink,
    IonIcon,
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonItem,
    IonInput,
    IonInputPasswordToggle,
    IonButton,
    IonSpinner,
  ],
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly photoBusy = signal(false);
  readonly photoError = signal<string | null>(null);

  /** Called by the hidden file input (Android offers camera or gallery). */
  async onPhotoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoBusy.set(true);
    this.photoError.set(null);
    try {
      await this.auth.updateAvatar(await squareImageDataUrl(file));
      await this.toast('Profile photo updated');
    } catch (err) {
      this.photoError.set(err instanceof Error && !('status' in err) ? err.message : apiErrorMessage(err));
    } finally {
      this.photoBusy.set(false);
    }
  }

  async removePhoto(): Promise<void> {
    this.photoBusy.set(true);
    try {
      await this.auth.updateAvatar(null);
      await this.toast('Profile photo removed');
    } catch (err) {
      this.photoError.set(apiErrorMessage(err));
    } finally {
      this.photoBusy.set(false);
    }
  }

  profile = { name: '', email: '', phone: '' };
  passwords = { current: '', next: '', confirm: '' };

  readonly saving = signal(false);
  readonly profileError = signal<string | null>(null);
  readonly changingPassword = signal(false);
  readonly passwordError = signal<string | null>(null);

  ionViewWillEnter(): void {
    const user = this.auth.user();
    if (user) this.profile = { name: user.name, email: user.email, phone: user.phone };
    this.passwords = { current: '', next: '', confirm: '' };
    this.profileError.set(null);
    this.passwordError.set(null);
  }

  async saveProfile(): Promise<void> {
    if (!this.profile.name.trim()) {
      this.profileError.set('Please enter your name.');
      return;
    }
    this.saving.set(true);
    this.profileError.set(null);
    try {
      const user = await this.auth.updateProfile({
        name: this.profile.name.trim(),
        email: this.profile.email.trim(),
        phone: this.profile.phone.trim(),
      });
      if (user.emailVerified === false) {
        // New email address → verify it.
        await this.router.navigate(['/verify-email'], { queryParams: { returnUrl: '/account' } });
        return;
      }
      await this.toast('Profile saved');
    } catch (err) {
      this.profileError.set(apiErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async changePassword(): Promise<void> {
    const { current, next, confirm } = this.passwords;
    if (!current || !next) {
      this.passwordError.set('Enter your current and new password.');
      return;
    }
    if (next.length < 8) {
      this.passwordError.set('Your new password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      this.passwordError.set('New passwords do not match.');
      return;
    }
    this.changingPassword.set(true);
    this.passwordError.set(null);
    try {
      await this.auth.changePassword(current, next);
      this.passwords = { current: '', next: '', confirm: '' };
      await this.toast('Password changed');
    } catch (err) {
      this.passwordError.set(apiErrorMessage(err));
    } finally {
      this.changingPassword.set(false);
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 1600, color: 'tertiary', position: 'bottom' });
    await toast.present();
  }
}
