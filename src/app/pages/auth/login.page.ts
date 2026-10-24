import { Component, inject, signal } from '@angular/core';
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
  IonInputPasswordToggle,
  IonButton,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
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
    IonInputPasswordToggle,
    IonButton,
    IonSpinner,
  ],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastCtrl = inject(ToastController);

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  get returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('/login') ? url : '/dashboard';
  }

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error.set('Please enter your email and password.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.login(this.email.trim(), this.password);
      const toast = await this.toastCtrl.create({
        message: `Welcome back, ${user.name.split(' ')[0]}!`,
        duration: 1600,
        color: 'tertiary',
        position: 'bottom',
      });
      await toast.present();
      await this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
