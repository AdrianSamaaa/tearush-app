import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonItem,
  IonInput,
  IonInputPasswordToggle,
  IonCheckbox,
  IonButton,
  IonIcon,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cardOutline, mailOutline, serverOutline, checkmarkCircle, alertCircleOutline, informationCircleOutline } from 'ionicons/icons';
import { PaymentMethod } from '../../models/order.model';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { IntegrationsService, ONLINE_METHODS, isTestSecretKey } from '../../services/integrations.service';
import { ShopService } from '../../services/shop.service';
import { sendEmailJs, verificationParams } from '../../services/emailjs';

addIcons({
  'card-outline': cardOutline,
  'mail-outline': mailOutline,
  'server-outline': serverOutline,
  'checkmark-circle': checkmarkCircle,
  'alert-circle-outline': alertCircleOutline,
  'information-circle-outline': informationCircleOutline,
});

/** Admin page for the on-device payment (PayMongo) and email (EmailJS) setup. */
@Component({
  selector: 'app-shop-settings',
  standalone: true,
  templateUrl: './shop-settings.page.html',
  styleUrls: ['./shop-settings.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonItem,
    IonInput,
    IonInputPasswordToggle,
    IonCheckbox,
    IonButton,
    IonIcon,
    IonSpinner,
  ],
})
export class ShopSettingsPage {
  readonly api = inject(ApiService);
  readonly integrations = inject(IntegrationsService);
  readonly shop = inject(ShopService);
  private auth = inject(AuthService);
  private toastCtrl = inject(ToastController);

  readonly methods = ONLINE_METHODS;
  /** EmailJS template variable names, shown in the setup steps. */
  readonly toEmailVar = '{{to_email}}';
  readonly codeVar = '{{code}}';
  form = { secretKey: '', methods: [] as PaymentMethod[], serviceId: '', templateId: '', publicKey: '', privateKey: '' };
  readonly payError = signal<string | null>(null);
  readonly testingEmail = signal(false);
  readonly emailResult = signal<{ ok: boolean; text: string } | null>(null);

  async ionViewWillEnter(): Promise<void> {
    await this.integrations.load();
    const s = this.integrations.settings();
    this.form = {
      secretKey: s.paymongoSecretKey,
      methods: [...s.paymongoMethods],
      serviceId: s.emailjsServiceId,
      templateId: s.emailjsTemplateId,
      publicKey: s.emailjsPublicKey,
      privateKey: s.emailjsPrivateKey,
    };
    void this.shop.loadConfig();
  }

  toggleMethod(method: PaymentMethod, on: boolean): void {
    this.form.methods = on ? [...new Set([...this.form.methods, method])] : this.form.methods.filter((m) => m !== method);
  }

  async savePayments(): Promise<void> {
    const key = this.form.secretKey.trim();
    if (key.startsWith('sk_live_')) {
      this.payError.set('Live keys must never be stored in the app. Use your TEST secret key here, or put the live key on the TeaRush server.');
      return;
    }
    if (key && !isTestSecretKey(key)) {
      this.payError.set('That doesn’t look like a PayMongo test secret key (it starts with sk_test_).');
      return;
    }
    if (key && !this.form.methods.length) {
      this.payError.set('Choose at least one payment method.');
      return;
    }
    this.payError.set(null);
    await this.integrations.save({ paymongoSecretKey: key, paymongoMethods: this.form.methods });
    await this.shop.loadConfig();
    await this.toast(key ? 'Online payments are on — customers now see GCash, Maya, cards and GrabPay.' : 'Online payments turned off.');
  }

  async saveEmail(): Promise<void> {
    await this.integrations.save({
      emailjsServiceId: this.form.serviceId.trim(),
      emailjsTemplateId: this.form.templateId.trim(),
      emailjsPublicKey: this.form.publicKey.trim(),
      emailjsPrivateKey: this.form.privateKey.trim(),
    });
    await this.toast(this.integrations.emailEnabled() ? 'Email settings saved.' : 'Email turned off — codes will be shown in the app (demo mode).');
  }

  /** Sends a sample verification email to the admin's own address. */
  async sendTestEmail(): Promise<void> {
    await this.saveEmail();
    const to = this.auth.user()?.email;
    if (!to || !this.integrations.emailEnabled()) return;
    this.testingEmail.set(true);
    this.emailResult.set(null);
    try {
      await sendEmailJs(this.integrations.emailJsKeys(), verificationParams(to, 'Admin', '123456'));
      this.emailResult.set({ ok: true, text: `Test email sent to ${to}.` });
    } catch (err) {
      this.emailResult.set({ ok: false, text: (err as Error).message });
    } finally {
      this.testingEmail.set(false);
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color: 'tertiary', position: 'bottom' });
    await toast.present();
  }
}
