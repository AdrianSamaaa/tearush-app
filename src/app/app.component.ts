import { Component, DestroyRef, OnInit, ViewChild, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonContent,
  IonList,
  IonItem,
  IonIcon,
  IonLabel,
  IonBadge,
  IonRouterOutlet,
  IonMenuToggle,
  AlertController,
  MenuController,
  Platform,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  home,
  cafeOutline,
  cafe,
  colorWandOutline,
  colorWand,
  cartOutline,
  cart,
  receiptOutline,
  receipt,
  pricetagsOutline,
  pricetags,
  personCircleOutline,
  personCircle,
  informationCircleOutline,
  informationCircle,
  peopleOutline,
  people,
  logOutOutline,
  logInOutline,
  leafOutline,
  cubeOutline,
  cube,
  clipboardOutline,
  clipboard,
  cloudOfflineOutline,
  businessOutline,
  business,
  sparklesOutline,
  sparkles,
  callOutline,
  call,
  chatbubblesOutline,
  chatbubbles,
  person,
  settingsOutline,
  settings,
} from 'ionicons/icons';
import { CartService } from './services/cart.service';
import { AuthService, SessionStore } from './services/auth.service';
import { NativeService } from './services/native.service';
import { OrderService } from './services/order.service';
import { ProductService } from './services/product.service';
import { AddressService } from './services/address.service';
import { ShopService } from './services/shop.service';

interface MenuItem {
  title: string;
  url: string;
  icon: string;
  iconActive: string;
  badge?: 'cart' | 'new' | 'orders';
}

addIcons({
  'home-outline': homeOutline,
  home,
  'cafe-outline': cafeOutline,
  cafe,
  'color-wand-outline': colorWandOutline,
  'color-wand': colorWand,
  'cart-outline': cartOutline,
  cart,
  'receipt-outline': receiptOutline,
  receipt,
  'pricetags-outline': pricetagsOutline,
  pricetags,
  'person-circle-outline': personCircleOutline,
  'person-circle': personCircle,
  'information-circle-outline': informationCircleOutline,
  'information-circle': informationCircle,
  'people-outline': peopleOutline,
  people,
  'log-out-outline': logOutOutline,
  'log-in-outline': logInOutline,
  'leaf-outline': leafOutline,
  'cube-outline': cubeOutline,
  cube,
  'clipboard-outline': clipboardOutline,
  clipboard,
  'cloud-offline-outline': cloudOfflineOutline,
  'business-outline': businessOutline,
  business,
  'sparkles-outline': sparklesOutline,
  sparkles,
  'call-outline': callOutline,
  call,
  'chatbubbles-outline': chatbubblesOutline,
  chatbubbles,
  person,
  'settings-outline': settingsOutline,
  settings,
});

const ORDER_POLL_MS = 30_000;
const ROOT_PAGES = ['/dashboard', '/'];

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonBadge,
    IonRouterOutlet,
    IonMenuToggle,
  ],
})
export class AppComponent implements OnInit {
  @ViewChild(IonRouterOutlet, { static: true }) private outlet?: IonRouterOutlet;

  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly native = inject(NativeService);
  private orders = inject(OrderService);
  private products = inject(ProductService);
  private addresses = inject(AddressService);
  private shop = inject(ShopService);
  private session = inject(SessionStore);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private menu = inject(MenuController);
  private platform = inject(Platform);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Primary navigation — the day-to-day ordering flow */
  mainPages: MenuItem[] = [
    { title: 'Home', url: '/dashboard', icon: 'home-outline', iconActive: 'home' },
    { title: 'Products', url: '/products', icon: 'cafe-outline', iconActive: 'cafe' },
    { title: 'My Cart', url: '/cart', icon: 'cart-outline', iconActive: 'cart', badge: 'cart' },
    { title: 'Customize My Drink', url: '/customize', icon: 'color-wand-outline', iconActive: 'color-wand' },
    { title: 'Order History', url: '/orders', icon: 'receipt-outline', iconActive: 'receipt', badge: 'orders' },
    { title: 'Promotions', url: '/promotions', icon: 'pricetags-outline', iconActive: 'pricetags', badge: 'new' },
    { title: 'My Account', url: '/account', icon: 'person-circle-outline', iconActive: 'person-circle' },
  ];

  /** Shop staff tools — only shown to admin accounts */
  adminPages: MenuItem[] = [
    { title: 'Manage Orders', url: '/manage-orders', icon: 'clipboard-outline', iconActive: 'clipboard' },
    { title: 'Manage Products', url: '/manage-products', icon: 'cube-outline', iconActive: 'cube' },
    { title: 'Customer Messages', url: '/manage-messages', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
    { title: 'Shop Settings', url: '/shop-settings', icon: 'settings-outline', iconActive: 'settings' },
  ];

  /** About TeaRush — company and app information */
  infoPages: MenuItem[] = [
    { title: 'Company History', url: '/company-history', icon: 'business-outline', iconActive: 'business' },
    { title: 'About Our Products', url: '/about-products', icon: 'sparkles-outline', iconActive: 'sparkles' },
    { title: 'About the App', url: '/about', icon: 'information-circle-outline', iconActive: 'information-circle' },
    { title: 'Developers', url: '/developers', icon: 'people-outline', iconActive: 'people' },
    { title: 'Contact Us', url: '/contact', icon: 'call-outline', iconActive: 'call' },
  ];

  readonly activeOrderCount = this.orders.activeOrders;

  constructor() {
    // Signed in/out: load or clear the user's data.
    let previousUserId: number | null | undefined;
    effect(() => {
      const user = this.auth.user();
      const id = user?.id ?? null;
      if (id === previousUserId) return;
      const firstRun = previousUserId === undefined;
      previousUserId = id;
      if (firstRun) return;
      this.orders.reset();
      this.addresses.reset();
      if (id) void this.orders.load();
      void this.products.refresh(user?.role === 'admin');
    });

    // The server rejected our token (expired or account deleted).
    let lastExpired = 0;
    effect(() => {
      const n = this.session.expired();
      if (n === lastExpired) return;
      lastExpired = n;
      void this.showToast('Your session has expired. Please log in again.', 'medium');
      void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
    });
  }

  ngOnInit(): void {
    void this.native.hideSplash();

    // Android hardware back: close the menu, go back, or exit from the home screen.
    this.platform.backButton.subscribeWithPriority(-1, async () => {
      if (await this.menu.isOpen()) {
        await this.menu.close();
        return;
      }
      const path = this.router.url.split('?')[0];
      if (this.outlet?.canGoBack()) {
        this.outlet.pop();
      } else if (ROOT_PAGES.includes(path)) {
        this.native.exitApp();
      } else {
        void this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      }
    });

    // Keep order statuses fresh while the app is open (drives "order is on the way" notifications).
    const poll = setInterval(() => {
      if (this.auth.isLoggedIn() && this.orders.activeOrders().length && document.visibilityState === 'visible') {
        void this.orders.load();
      }
    }, ORDER_POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(poll));

    this.native.resumed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refreshAll());
    this.native.reconnected$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.showToast('Back online', 'tertiary');
      this.refreshAll();
    });
  }

  private refreshAll(): void {
    void this.products.refresh(this.auth.isAdmin());
    void this.shop.loadConfig();
    if (this.auth.isLoggedIn()) void this.orders.load();
  }

  async logout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Log out',
      message: 'Are you sure you want to log out of TeaRush?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Log out',
          role: 'destructive',
          handler: () => {
            void this.menu.close();
            void this.auth.logout();
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color, position: 'bottom' });
    await toast.present();
  }
}
