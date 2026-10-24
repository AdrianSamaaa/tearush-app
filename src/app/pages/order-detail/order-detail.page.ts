import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonButton,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  receiptOutline,
  timeOutline,
  bicycleOutline,
  bagCheckOutline,
  checkmarkCircle,
  closeCircleOutline,
  cardOutline,
  locationOutline,
  callOutline,
  chatbubbleOutline,
  refreshOutline,
  helpCircleOutline,
  alertCircleOutline,
  cafeOutline,
} from 'ionicons/icons';
import { Order, OrderStatus, STATUS_ICONS } from '../../models/order.model';
import { OrderService } from '../../services/order.service';
import { PaymentService } from '../../services/payment.service';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { NativeService } from '../../services/native.service';
import { apiErrorMessage } from '../../services/api.service';
import { PesoPipe } from '../../core/peso.pipe';

addIcons({
  'receipt-outline': receiptOutline,
  'time-outline': timeOutline,
  'bicycle-outline': bicycleOutline,
  'bag-check-outline': bagCheckOutline,
  'checkmark-circle': checkmarkCircle,
  'close-circle-outline': closeCircleOutline,
  'card-outline': cardOutline,
  'location-outline': locationOutline,
  'call-outline': callOutline,
  'chatbubble-outline': chatbubbleOutline,
  'refresh-outline': refreshOutline,
  'help-circle-outline': helpCircleOutline,
  'alert-circle-outline': alertCircleOutline,
  'cafe-outline': cafeOutline,
});

const POLL_MS = 15_000;
const FAST_POLL_MS = 4_000;
const TERMINAL: OrderStatus[] = ['completed', 'cancelled'];

interface Step {
  status: OrderStatus;
  label: string;
  done: boolean;
  current: boolean;
  at?: string;
}

@Component({
  selector: 'app-order-detail',
  standalone: true,
  templateUrl: './order-detail.page.html',
  styleUrls: ['./order-detail.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    PesoPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class OrderDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private orders = inject(OrderService);
  private payment = inject(PaymentService);
  private cart = inject(CartService);
  private products = inject(ProductService);
  private native = inject(NativeService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  readonly statusIcons = STATUS_ICONS;
  readonly order = signal<Order | null>(null);
  readonly error = signal<string | null>(null);
  readonly paying = signal(false);
  readonly cancelling = signal(false);

  private orderId = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private fastPollUntil = 0;
  private visible = false;

  readonly steps = computed<Step[]>(() => {
    const order = this.order();
    if (!order) return [];
    const flow: OrderStatus[] =
      order.fulfillment === 'pickup'
        ? ['pending', 'preparing', 'ready_for_pickup', 'completed']
        : ['pending', 'preparing', 'out_for_delivery', 'completed'];
    const labels: Record<string, string> = {
      pending: 'Order placed',
      preparing: 'Preparing',
      out_for_delivery: 'On the way',
      ready_for_pickup: 'Ready for pickup',
      completed: 'Completed',
    };
    const currentIndex = flow.indexOf(order.status);
    return flow.map((status, i) => ({
      status,
      label: labels[status],
      done: currentIndex >= i,
      current: currentIndex === i,
      at: [...order.events].reverse().find((e) => e.status === status)?.createdAt,
    }));
  });

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.paramMap.get('id'));
    void this.load().then(() => this.showArrivalMessage());

    this.payment.returned$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ orderId, result }) => {
      if (orderId !== this.orderId) return;
      this.fastPollUntil = Date.now() + 30_000;
      void this.load().then(() => this.showPaymentResult(result));
    });
    this.payment.browserClosed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.fastPollUntil = Date.now() + 20_000;
      void this.load();
    });
    this.native.resumed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => void this.load());
    this.destroyRef.onDestroy(() => clearTimeout(this.timer));
  }

  ionViewDidEnter(): void {
    this.visible = true;
    this.schedulePoll();
  }

  ionViewWillLeave(): void {
    this.visible = false;
    clearTimeout(this.timer);
  }

  async load(): Promise<void> {
    try {
      this.order.set(await this.orders.get(this.orderId));
      this.error.set(null);
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    }
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  private schedulePoll(): void {
    clearTimeout(this.timer);
    if (!this.visible) return;
    const status = this.order()?.status;
    if (status && TERMINAL.includes(status)) return;
    const delay = Date.now() < this.fastPollUntil ? FAST_POLL_MS : POLL_MS;
    this.timer = setTimeout(async () => {
      await this.load();
      this.schedulePoll();
    }, delay);
  }

  private async showArrivalMessage(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const result = params.get('payment');
    if (result === 'success' || result === 'cancel') {
      this.fastPollUntil = Date.now() + 30_000;
      this.schedulePoll();
      await this.showPaymentResult(result);
    } else if (params.get('placed')) {
      await this.toast('Order placed! We’ll keep you posted here. 🧋', 'tertiary');
    }
  }

  private async showPaymentResult(result: 'success' | 'cancel'): Promise<void> {
    const order = this.order();
    if (order?.paymentStatus === 'paid') {
      this.native.success();
      await this.toast('Payment received — thank you! 🧋', 'tertiary');
    } else if (result === 'success') {
      await this.toast('Confirming your payment…', 'medium');
    } else {
      await this.toast('Payment cancelled. You can pay again anytime.', 'medium');
    }
  }

  async payNow(): Promise<void> {
    this.paying.set(true);
    try {
      const { order, checkoutUrl } = await this.orders.pay(this.orderId);
      this.order.set(order);
      if (checkoutUrl) {
        this.fastPollUntil = Date.now() + 120_000;
        await this.payment.openCheckout(checkoutUrl);
      } else {
        await this.toast('This order is already paid.', 'tertiary');
      }
    } catch (err) {
      await this.alert('Could not start payment', apiErrorMessage(err));
    } finally {
      this.paying.set(false);
    }
  }

  async confirmCancel(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cancel this order?',
      message: 'The shop will not prepare it. This cannot be undone.',
      buttons: [
        { text: 'Keep order', role: 'cancel' },
        { text: 'Cancel order', role: 'destructive', handler: () => void this.cancel() },
      ],
    });
    await alert.present();
  }

  private async cancel(): Promise<void> {
    this.cancelling.set(true);
    try {
      this.order.set(await this.orders.cancel(this.orderId));
      await this.toast('Order cancelled', 'medium');
    } catch (err) {
      await this.alert('Could not cancel', apiErrorMessage(err));
      void this.load();
    } finally {
      this.cancelling.set(false);
    }
  }

  async reorder(): Promise<void> {
    const order = this.order();
    if (!order) return;
    const added = this.cart.addFromOrder(order.items, (id) => this.products.getById(id)?.price);
    if (!added) {
      await this.alert('Not available', 'These drinks are no longer on the menu.');
      return;
    }
    await this.toast(added < order.items.length ? 'Some drinks are no longer available — the rest were added.' : 'Added to your cart', 'tertiary');
    await this.router.navigateByUrl('/cart');
  }

  paymentStatusText(o: Order): string {
    if (o.paymentStatus === 'refunded') return 'Refunded';
    if (o.paymentStatus !== 'paid') return o.paymentMethod === 'cod' ? 'Pay when you receive your order' : 'Not paid yet';
    const via = o.paidVia && o.paidVia !== o.paymentMethodLabel ? ` via ${o.paidVia}` : '';
    const when = o.paidAt
      ? ` · ${new Date(o.paidAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : '';
    return `Paid${via}${when}`;
  }

  hideImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  private async toast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color, position: 'bottom' });
    await toast.present();
  }

  private async alert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({ header, message, buttons: ['OK'] });
    await alert.present();
  }
}
