import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pricetagsOutline, copyOutline, checkmarkCircle, cloudOfflineOutline } from 'ionicons/icons';
import { ShopService } from '../../services/shop.service';
import { CartService } from '../../services/cart.service';
import { NativeService } from '../../services/native.service';

addIcons({
  'pricetags-outline': pricetagsOutline,
  'copy-outline': copyOutline,
  'checkmark-circle': checkmarkCircle,
  'cloud-offline-outline': cloudOfflineOutline,
});

@Component({
  selector: 'app-promotions',
  standalone: true,
  templateUrl: './promotions.page.html',
  styleUrls: ['./promotions.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonContent, IonIcon, IonRefresher, IonRefresherContent],
})
export class PromotionsPage {
  readonly shop = inject(ShopService);
  readonly cart = inject(CartService);
  private native = inject(NativeService);
  private toastCtrl = inject(ToastController);

  ionViewWillEnter(): void {
    void this.shop.loadPromos();
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.shop.loadPromos();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async copyCode(code: string): Promise<void> {
    await this.native.copy(code);
    this.native.tap();
    await this.toast(`Code "${code}" copied`);
  }

  async useCode(code: string): Promise<void> {
    this.cart.promoCode.set(code);
    this.native.tap();
    await this.toast(`${code} will be applied at checkout`);
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 1400, color: 'tertiary', position: 'bottom' });
    await toast.present();
  }
}
