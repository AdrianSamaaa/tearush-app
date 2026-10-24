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
  IonIcon,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  refreshOutline,
  personOutline,
  callOutline,
  locationOutline,
  storefrontOutline,
  chatbubbleOutline,
  alertCircleOutline,
  clipboardOutline,
  cardOutline,
  timeOutline,
  bicycleOutline,
  bagCheckOutline,
  checkmarkCircle,
  closeCircleOutline,
  receiptOutline,
} from 'ionicons/icons';
import { AdminStats, Order, OrderStatus, STATUS_ICONS } from '../../models/order.model';
import { AdminOrderFilter, OrderService } from '../../services/order.service';
import { apiErrorMessage } from '../../services/api.service';
import { PesoPipe } from '../../core/peso.pipe';

addIcons({
  'refresh-outline': refreshOutline,
  'person-outline': personOutline,
  'call-outline': callOutline,
  'location-outline': locationOutline,
  'storefront-outline': storefrontOutline,
  'chatbubble-outline': chatbubbleOutline,
  'alert-circle-outline': alertCircleOutline,
  'clipboard-outline': clipboardOutline,
  'card-outline': cardOutline,
  'time-outline': timeOutline,
  'bicycle-outline': bicycleOutline,
  'bag-check-outline': bagCheckOutline,
  'checkmark-circle': checkmarkCircle,
  'close-circle-outline': closeCircleOutline,
  'receipt-outline': receiptOutline,
});

const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  preparing: 'Start preparing',
  out_for_delivery: 'Out for delivery',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Mark completed',
};

const AUTO_REFRESH_MS = 20_000;

@Component({
  selector: 'app-manage-orders',
  standalone: true,
  templateUrl: './manage-orders.page.html',
  styleUrls: ['./manage-orders.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    PesoPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonIcon,
    IonButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class ManageOrdersPage {
  private orderService = inject(OrderService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly statusIcons = STATUS_ICONS;
  readonly filters: { value: AdminOrderFilter; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'completed', label: 'Done' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'all', label: 'All' },
  ];

  filter: AdminOrderFilter = 'active';
  readonly orders = signal<Order[]>([]);
  readonly stats = signal<AdminStats | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);
  private timer?: ReturnType<typeof setInterval>;

  ionViewWillEnter(): void {
    void this.load();
    this.timer = setInterval(() => void this.load(true), AUTO_REFRESH_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.timer);
  }

  async load(silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    try {
      const [orders, stats] = await Promise.all([this.orderService.adminList(this.filter), this.orderService.adminStats()]);
      this.orders.set(orders);
      this.stats.set(stats);
      this.error.set(null);
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.load(true);
    (event.target as HTMLIonRefresherElement).complete();
  }

  changeFilter(value: unknown): void {
    this.filter = value as AdminOrderFilter;
    this.orders.set([]);
    void this.load();
  }

  actionLabel(status: OrderStatus): string {
    return ACTION_LABELS[status] ?? status;
  }

  forwardActions(order: Order) {
    return (order.nextStatuses ?? []).filter((s) => s.value !== 'cancelled');
  }

  canCancel(order: Order): boolean {
    return (order.nextStatuses ?? []).some((s) => s.value === 'cancelled');
  }

  summary(order: Order): string {
    return order.items
      .map((i) => `${i.quantity}× ${i.name} (${i.size}, ${i.sugar}, ${i.ice}${i.toppings.length ? ', + ' + i.toppings.join(', ') : ''})`)
      .join('\n');
  }

  async advance(order: Order, status: OrderStatus): Promise<void> {
    await this.update(order, status);
  }

  async confirmCancel(order: Order): Promise<void> {
    const paid = order.paymentStatus === 'paid';
    const alert = await this.alertCtrl.create({
      header: `Cancel ${order.orderNumber}?`,
      message: paid
        ? `This order was paid online (${order.total.toFixed(2)} PHP). Cancelling will request a full refund through PayMongo.`
        : 'The customer will see the reason below.',
      inputs: [{ name: 'reason', type: 'text', placeholder: 'Reason (e.g. Out of stock)' }],
      buttons: [
        { text: 'Keep', role: 'cancel' },
        {
          text: 'Cancel order',
          role: 'destructive',
          handler: (data: { reason: string }) => void this.update(order, 'cancelled', data.reason?.trim()),
        },
      ],
    });
    await alert.present();
  }

  private async update(order: Order, status: OrderStatus, note?: string): Promise<void> {
    this.busyId.set(order.id);
    try {
      const updated = await this.orderService.adminUpdateStatus(order.id, status, note);
      this.orders.update((list) => list.map((o) => (o.id === updated.id ? updated : o)));
      const toast = await this.toastCtrl.create({
        message: `${updated.orderNumber}: ${updated.statusLabel}`,
        duration: 1400,
        color: 'tertiary',
        position: 'bottom',
      });
      await toast.present();
      void this.load(true);
    } catch (err) {
      const alert = await this.alertCtrl.create({ header: 'Update failed', message: apiErrorMessage(err), buttons: ['OK'] });
      await alert.present();
    } finally {
      this.busyId.set(null);
    }
  }
}
