import { inject } from '@angular/core';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { NativeService } from '../services/native.service';
import { NotificationService } from '../services/notification.service';
import { OrderService } from '../services/order.service';
import { PaymentService } from '../services/payment.service';
import { ProductService } from '../services/product.service';
import { ShopService } from '../services/shop.service';

/**
 * Runs before the first screen renders: restores everything saved on the
 * device (server URL, login, cart, cached menu), then refreshes from the
 * API in the background so start-up never waits on the network.
 */
export function initializeApp(): Promise<void> {
  const api = inject(ApiService);
  const auth = inject(AuthService);
  const cart = inject(CartService);
  const products = inject(ProductService);
  const shop = inject(ShopService);
  const orders = inject(OrderService);
  const notifications = inject(NotificationService);
  const payment = inject(PaymentService);
  const native = inject(NativeService);

  return (async () => {
    await api.init();
    await Promise.all([auth.init(), cart.init(), products.init(), shop.init(), notifications.init(), native.init()]);
    await payment.init().catch((err) => console.warn('Payment listeners unavailable', err));

    void products.refresh(auth.isAdmin());
    void shop.loadConfig();
    void shop.loadPromos();
    if (auth.isLoggedIn()) void orders.load();
  })();
}
