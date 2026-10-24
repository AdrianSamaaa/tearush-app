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
  IonButton,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  receiptOutline,
  timeOutline,
  checkmarkCircle,
  bicycleOutline,
  bagCheckOutline,
  cardOutline,
  closeCircleOutline,
  alertCircleOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { Order, STATUS_ICONS } from '../../models/order.model';
import { OrderService } from '../../services/order.service';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { PesoPipe } from '../../core/peso.pipe';

addIcons({
  'receipt-outline': receiptOutline,
  'time-outline': timeOutline,
  'checkmark-circle': checkmarkCircle,
  'bicycle-outline': bicycleOutline,
  'bag-check-outline': bagCheckOutline,
  'card-outline': cardOutline,
  'close-circle-outline': closeCircleOutline,
  'alert-circle-outline': alertCircleOutline,
  'chevron-forward-outline': chevronForwardOutline,
});

@Component({
  selector: 'app-orders',
  standalone: true,
  templateUrl: './orders.page.html',
  styleUrls: ['./orders.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    PesoPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class OrdersPage {
  readonly orderService = inject(OrderService);
  private cart = inject(CartService);
  private products = inject(ProductService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  readonly statusIcons = STATUS_ICONS;

  ionViewWillEnter(): void {
    void this.orderService.load();
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.orderService.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  summary(order: Order): string {
    return order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
  }

  async reorder(order: Order, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    const added = this.cart.addFromOrder(order.items, (id) => this.products.getById(id)?.price);
    const toast = await this.toastCtrl.create({
      message: added ? 'Added to your cart' : 'These drinks are no longer on the menu.',
      duration: 1600,
      color: added ? 'tertiary' : 'medium',
      position: 'bottom',
    });
    await toast.present();
    if (added) await this.router.navigateByUrl('/cart');
  }
}
