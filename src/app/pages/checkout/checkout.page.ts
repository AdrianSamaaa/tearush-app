import { Component, computed, inject, signal } from '@angular/core';
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
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonIcon,
  IonButton,
  IonItem,
  IonInput,
  IonTextarea,
  IonFooter,
  IonSpinner,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bicycleOutline,
  storefrontOutline,
  locationOutline,
  addCircleOutline,
  checkmarkCircle,
  ellipseOutline,
  walletOutline,
  cardOutline,
  cashOutline,
  carOutline,
  qrCodeOutline,
  pricetagOutline,
  closeCircle,
  lockClosedOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { Fulfillment, PaymentMethod, Quote } from '../../models/order.model';
import { formatAddress } from '../../models/user.model';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { ShopService } from '../../services/shop.service';
import { AddressService } from '../../services/address.service';
import { OrderService } from '../../services/order.service';
import { PaymentService } from '../../services/payment.service';
import { NotificationService } from '../../services/notification.service';
import { NativeService } from '../../services/native.service';
import { ApiService, apiErrorMessage } from '../../services/api.service';
import { ONLINE_METHODS } from '../../services/integrations.service';
import { PesoPipe } from '../../core/peso.pipe';

addIcons({
  'bicycle-outline': bicycleOutline,
  'storefront-outline': storefrontOutline,
  'location-outline': locationOutline,
  'add-circle-outline': addCircleOutline,
  'checkmark-circle': checkmarkCircle,
  'ellipse-outline': ellipseOutline,
  'wallet-outline': walletOutline,
  'card-outline': cardOutline,
  'cash-outline': cashOutline,
  'car-outline': carOutline,
  'qr-code-outline': qrCodeOutline,
  'pricetag-outline': pricetagOutline,
  'close-circle': closeCircle,
  'lock-closed-outline': lockClosedOutline,
  'alert-circle-outline': alertCircleOutline,
});

const METHOD_ICONS: Partial<Record<PaymentMethod, string>> = {
  gcash: 'wallet-outline',
  paymaya: 'wallet-outline',
  card: 'card-outline',
  grab_pay: 'car-outline',
  qrph: 'qr-code-outline',
  cod: 'cash-outline',
};

@Component({
  selector: 'app-checkout',
  standalone: true,
  templateUrl: './checkout.page.html',
  styleUrls: ['./checkout.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    PesoPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonIcon,
    IonButton,
    IonItem,
    IonInput,
    IonTextarea,
    IonFooter,
    IonSpinner,
  ],
})
export class CheckoutPage {
  readonly cart = inject(CartService);
  readonly shop = inject(ShopService);
  readonly addressService = inject(AddressService);
  readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private orders = inject(OrderService);
  private payment = inject(PaymentService);
  private notifications = inject(NotificationService);
  private native = inject(NativeService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);

  readonly formatAddress = formatAddress;

  readonly fulfillment = signal<Fulfillment>('delivery');
  readonly paymentMethod = signal<PaymentMethod>('cod');
  readonly selectedAddressId = signal<number | null>(null);
  readonly appliedPromo = signal('');
  readonly quote = signal<Quote | null>(null);
  readonly quoting = signal(false);
  readonly quoteError = signal<string | null>(null);
  readonly placing = signal(false);
  readonly addressesLoading = signal(false);
  readonly addressesError = signal<string | null>(null);

  promoInput = '';
  contactName = '';
  contactPhone = '';
  notes = '';

  /** Online methods are always listed; they're greyed out until payments are set up. */
  readonly paymentOptions = computed(() => {
    const live = this.shop.paymentMethods();
    const online = live.length
      ? live.map((m) => ({ ...m, available: true }))
      : ONLINE_METHODS.map((m) => ({ ...m, available: false }));
    return [
      ...online,
      { value: 'cod' as PaymentMethod, label: this.fulfillment() === 'pickup' ? 'Cash on pickup' : 'Cash on Delivery', available: true },
    ];
  });

  readonly total = computed(() => this.quote()?.total ?? this.cart.subtotal() + (this.fulfillment() === 'delivery' ? this.shop.deliveryFee() : 0));

  readonly isOnlinePayment = computed(() => this.paymentMethod() !== 'cod');

  /** Ionic lifecycle: runs every time the page is shown (e.g. coming back from Addresses). */
  ionViewWillEnter(): void {
    if (!this.cart.items().length) {
      void this.router.navigateByUrl('/cart', { replaceUrl: true });
      return;
    }
    const user = this.auth.user();
    this.contactName ||= user?.name ?? '';
    this.contactPhone ||= user?.phone ?? '';
    if (!this.appliedPromo() && this.cart.promoCode()) {
      this.appliedPromo.set(this.cart.promoCode());
      this.promoInput = this.cart.promoCode();
    }
    void this.shop.loadConfig();
    void this.loadAddresses();
    void this.requote();
  }

  iconFor(method: PaymentMethod): string {
    return METHOD_ICONS[method] ?? 'wallet-outline';
  }

  async loadAddresses(): Promise<void> {
    this.addressesLoading.set(true);
    try {
      await this.addressService.load();
      this.addressesError.set(null);
      const current = this.selectedAddressId();
      if (!current || !this.addressService.addresses().some((a) => a.id === current)) {
        this.selectedAddressId.set(this.addressService.defaultAddress()?.id ?? null);
      }
    } catch (err) {
      this.addressesError.set(apiErrorMessage(err));
    } finally {
      this.addressesLoading.set(false);
    }
  }

  async requote(): Promise<void> {
    if (!this.cart.items().length) return;
    this.quoting.set(true);
    try {
      this.quote.set(await this.orders.quote(this.cart.toOrderLines(), this.fulfillment(), this.appliedPromo() || undefined));
      this.quoteError.set(null);
    } catch (err) {
      this.quoteError.set(apiErrorMessage(err));
    } finally {
      this.quoting.set(false);
    }
  }

  setFulfillment(value: Fulfillment | string | undefined): void {
    if (value !== 'delivery' && value !== 'pickup') return;
    this.fulfillment.set(value);
    void this.requote();
  }

  selectAddress(id: number): void {
    this.native.tap();
    this.selectedAddressId.set(id);
  }

  async selectPayment(option: { value: PaymentMethod; label: string; available: boolean }): Promise<void> {
    this.native.tap();
    if (option.available) {
      this.paymentMethod.set(option.value);
      return;
    }
    const isAdmin = this.auth.isAdmin();
    const alert = await this.alertCtrl.create({
      header: `${option.label} isn't set up yet`,
      message: isAdmin
        ? 'Add your PayMongo test secret key in Shop Settings to accept GCash, Maya, cards and GrabPay.'
        : 'The shop hasn’t turned on online payments yet. Please choose cash for now.',
      buttons: isAdmin
        ? [{ text: 'Later', role: 'cancel' }, { text: 'Open Shop Settings', handler: () => void this.router.navigateByUrl('/shop-settings') }]
        : ['OK'],
    });
    await alert.present();
  }

  applyPromo(): void {
    const code = this.promoInput.trim().toUpperCase();
    this.promoInput = code;
    this.appliedPromo.set(code);
    this.cart.promoCode.set(code);
    void this.requote();
  }

  removePromo(): void {
    this.promoInput = '';
    this.appliedPromo.set('');
    this.cart.promoCode.set('');
    void this.requote();
  }

  private validationProblem(): string | null {
    if (this.fulfillment() === 'delivery' && !this.selectedAddressId()) return 'Please add or choose a delivery address.';
    if (this.fulfillment() === 'pickup') {
      if (!this.contactName.trim()) return 'Please enter the name for pickup.';
      if (this.contactPhone.trim() && !/^(\+639|09)\d{9}$/.test(this.contactPhone.replace(/[\s-]/g, ''))) {
        return 'Please enter a valid PH mobile number for pickup, or leave it empty.';
      }
    }
    if (this.appliedPromo() && this.quote()?.promoError) return `${this.quote()!.promoError} Remove the code to continue.`;
    if (this.quoteError()) return this.quoteError();
    return null;
  }

  async placeOrder(): Promise<void> {
    const problem = this.validationProblem();
    if (problem) {
      await this.showAlert("Can't place order yet", problem);
      return;
    }

    this.placing.set(true);
    try {
      const { order, checkoutUrl } = await this.orders.place({
        items: this.cart.toOrderLines(),
        fulfillment: this.fulfillment(),
        paymentMethod: this.paymentMethod(),
        promoCode: this.appliedPromo() || undefined,
        addressId: this.fulfillment() === 'delivery' ? this.selectedAddressId()! : undefined,
        contactName: this.fulfillment() === 'pickup' ? this.contactName.trim() : undefined,
        contactPhone: this.fulfillment() === 'pickup' ? this.contactPhone : undefined,
        notes: this.notes.trim() || undefined,
      });
      this.cart.clear();
      this.native.success();

      if (checkoutUrl) {
        await this.router.navigate(['/orders', order.id], { replaceUrl: true });
        await this.payment.openCheckout(checkoutUrl);
      } else {
        void this.notifications.notify('Order placed! 🧋', `${order.orderNumber} has been sent to the shop.`, order.id);
        await this.router.navigate(['/orders', order.id], { replaceUrl: true, queryParams: { placed: 1 } });
      }
    } catch (err) {
      await this.showAlert('Order not placed', apiErrorMessage(err));
      void this.requote();
    } finally {
      this.placing.set(false);
    }
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({ header, message, buttons: ['OK'] });
    await alert.present();
  }
}
