import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonIcon,
  IonToggle,
  IonButton,
  AlertController,
  LoadingController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personCircleOutline,
  createOutline,
  locationOutline,
  cardOutline,
  notificationsOutline,
  helpCircleOutline,
  logOutOutline,
  chevronForwardOutline,
  serverOutline,
  trashOutline,
  clipboardOutline,
  cubeOutline,
  receiptOutline,
  mailOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { ApiService, apiErrorMessage } from '../../services/api.service';
import { NotificationService } from '../../services/notification.service';
import { ShopService } from '../../services/shop.service';
import { ProductService } from '../../services/product.service';

addIcons({
  'person-circle-outline': personCircleOutline,
  'create-outline': createOutline,
  'location-outline': locationOutline,
  'card-outline': cardOutline,
  'notifications-outline': notificationsOutline,
  'help-circle-outline': helpCircleOutline,
  'log-out-outline': logOutOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'server-outline': serverOutline,
  'trash-outline': trashOutline,
  'clipboard-outline': clipboardOutline,
  'cube-outline': cubeOutline,
  'receipt-outline': receiptOutline,
  'mail-outline': mailOutline,
});

@Component({
  selector: 'app-account',
  standalone: true,
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
  imports: [CommonModule, RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonContent, IonIcon, IonToggle, IonButton],
})
export class AccountPage {
  readonly auth = inject(AuthService);
  readonly api = inject(ApiService);
  readonly notifications = inject(NotificationService);
  private shop = inject(ShopService);
  private products = inject(ProductService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);

  settingsItems = [
    { label: 'Edit Profile & Photo', icon: 'create-outline', url: '/account/profile' },
    { label: 'Delivery Addresses', icon: 'location-outline', url: '/account/addresses' },
    { label: 'Order History', icon: 'receipt-outline', url: '/orders' },
    { label: 'Help & Support', icon: 'help-circle-outline', url: '/help' },
  ];

  async toggleNotifications(event: CustomEvent): Promise<void> {
    const on = (event.detail as { checked: boolean }).checked;
    const ok = await this.notifications.setEnabled(on);
    if (!ok) {
      await this.toast('Notifications are blocked. Allow them for TeaRush in Android Settings → Apps.');
    }
  }

  async showPaymentMethods(): Promise<void> {
    const online = this.shop.paymentMethods().map((m) => m.label);
    const alert = await this.alertCtrl.create({
      header: 'Payment Methods',
      message: online.length
        ? `Pay securely through PayMongo with ${online.join(', ')} — or pay cash on delivery/pickup. TeaRush never stores your card or e-wallet details.`
        : 'Cash on delivery and cash on pickup are available. Online payments (GCash, Maya, cards) will appear here once enabled by the shop.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  get serverLabel(): string {
    return this.api.mode() === 'device' ? 'On this device (no server)' : this.api.baseUrl();
  }

  async editServer(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Server connection',
      message:
        'Leave empty to keep everything on this phone (cash orders only). Enter your TeaRush server URL to sync accounts and enable GCash/Maya/card payments.',
      inputs: [{ name: 'url', type: 'url', value: this.api.baseUrl(), placeholder: 'https://your-server.onrender.com' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Save', handler: (data: { url: string }) => void this.saveServer(data.url) },
      ],
    });
    await alert.present();
  }

  private async saveServer(url: string): Promise<void> {
    const target = url.trim();
    if (target && !/^https?:\/\/.+/.test(target)) {
      await this.toast('Enter a full URL starting with http:// or https://, or leave it empty.');
      return;
    }
    if (target === this.api.baseUrl()) return;
    const loading = await this.loadingCtrl.create({ message: target ? 'Checking server…' : 'Switching…' });
    await loading.present();
    const reachable = await this.api.ping(target);
    await loading.dismiss();
    // Accounts don't carry over between the phone and a server, so start signed out.
    if (this.auth.isLoggedIn()) await this.auth.logout();
    await this.api.setBaseUrl(target);
    await this.toast(
      !target
        ? 'Now using on-device data.'
        : reachable
          ? 'Connected to the TeaRush server ✓'
          : "Saved, but the server isn't reachable right now."
    );
    void this.products.refresh(this.auth.isAdmin());
    void this.shop.loadConfig();
    void this.shop.loadPromos();
    void this.auth.refreshProfile();
  }

  async logout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Log out',
      message: 'Are you sure you want to log out of TeaRush?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Log out', role: 'destructive', handler: () => void this.auth.logout() },
      ],
    });
    await alert.present();
  }

  async deleteAccount(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete account?',
      message: 'This permanently deletes your TeaRush account, saved addresses and login. Enter your password to confirm.',
      inputs: [{ name: 'password', type: 'password', placeholder: 'Password' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: (data: { password: string }) => {
            void this.confirmDelete(data.password);
          },
        },
      ],
    });
    await alert.present();
  }

  private async confirmDelete(password: string): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Deleting account…' });
    await loading.present();
    try {
      await this.auth.deleteAccount(password);
      await loading.dismiss();
      await this.toast('Your account has been deleted.');
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch (err) {
      await loading.dismiss();
      await this.toast(apiErrorMessage(err));
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2400, color: 'medium', position: 'bottom' });
    await toast.present();
  }
}
