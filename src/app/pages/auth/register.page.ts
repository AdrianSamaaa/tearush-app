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
  selector: 'app-register',
  standalone: true,
  templateUrl: './register.page.html',
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
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastCtrl = inject(ToastController);

  form = { name: '', email: '', phone: '', password: '', confirm: '' };
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  get returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('/register') ? url : '/dashboard';
  }

  private validate(): string | null {
    const { name, email, phone, password, confirm } = this.form;
    if (!name.trim()) return 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email address.';
    if (phone.trim() && !/^(\+639|09)\d{9}$/.test(phone.replace(/[\s-]/g, ''))) {
      return 'Please enter a valid PH mobile number (e.g. 0917 123 4567), or leave it empty.';
    }
    if (password.length < 8) return 'Your password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  }

  async submit(): Promise<void> {
    const problem = this.validate();
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.register({
        name: this.form.name.trim(),
        email: this.form.email.trim(),
        phone: this.form.phone,
        password: this.form.password,
      });
      const toast = await this.toastCtrl.create({
        message: `Welcome to TeaRush, ${user.name.split(' ')[0]}! 🧋 Check your email for a code.`,
        duration: 2200,
        color: 'tertiary',
        position: 'bottom',
      });
      await toast.present();
      await this.router.navigate(['/verify-email'], { queryParams: { returnUrl: this.returnUrl }, replaceUrl: true });
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
