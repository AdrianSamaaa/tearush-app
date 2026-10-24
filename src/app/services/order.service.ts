import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ACTIVE_STATUSES,
  AdminStats,
  Order,
  OrderLineInput,
  OrderStatus,
  PlaceOrderInput,
  Quote,
} from '../models/order.model';
import { ApiService, apiErrorMessage } from './api.service';
import { NotificationService } from './notification.service';

export type AdminOrderFilter = 'active' | 'unpaid' | 'completed' | 'cancelled' | 'all';

const STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  pending: 'Payment received — your order has been sent to the shop.',
  preparing: 'Your drinks are being prepared. 🧋',
  out_for_delivery: 'Your order is on the way!',
  ready_for_pickup: 'Your order is ready for pickup.',
  completed: 'Order completed. Enjoy your milk tea!',
  cancelled: 'Your order was cancelled.',
};

@Injectable({ providedIn: 'root' })
export class OrderService {
  private api = inject(ApiService);
  private notifications = inject(NotificationService);

  private readonly _orders = signal<Order[]>([]);
  readonly orders = this._orders.asReadonly();
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  readonly activeOrders = computed(() => this._orders().filter((o) => ACTIVE_STATUSES.includes(o.status)));

  /** Last status we saw per order, so changes can trigger a notification. */
  private knownStatus = new Map<number, OrderStatus>();

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const { orders } = await this.api.get<{ orders: Order[] }>('/orders');
      this.notifyChanges(orders);
      this._orders.set(orders);
      this.error.set(null);
      this.loaded.set(true);
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async get(id: number): Promise<Order> {
    const { order } = await this.api.get<{ order: Order }>(`/orders/${id}`);
    this.upsert(order);
    return order;
  }

  async quote(items: OrderLineInput[], fulfillment: PlaceOrderInput['fulfillment'], promoCode?: string): Promise<Quote> {
    const { quote } = await this.api.post<{ quote: Quote }>('/orders/quote', { items, fulfillment, promoCode });
    return quote;
  }

  async place(input: PlaceOrderInput): Promise<{ order: Order; checkoutUrl: string | null }> {
    const res = await this.api.post<{ order: Order; checkoutUrl: string | null }>('/orders', input);
    this.upsert(res.order);
    return res;
  }

  /** Gets a (new or existing) PayMongo checkout link for an unpaid order. */
  async pay(id: number): Promise<{ order: Order; checkoutUrl: string | null }> {
    const res = await this.api.post<{ order: Order; checkoutUrl: string | null }>(`/orders/${id}/pay`);
    this.upsert(res.order);
    return res;
  }

  async cancel(id: number): Promise<Order> {
    const { order } = await this.api.post<{ order: Order }>(`/orders/${id}/cancel`);
    this.upsert(order);
    return order;
  }

  reset(): void {
    this._orders.set([]);
    this.loaded.set(false);
    this.knownStatus.clear();
  }

  // ---------- Admin ----------

  async adminList(filter: AdminOrderFilter): Promise<Order[]> {
    const { orders } = await this.api.get<{ orders: Order[] }>('/admin/orders', { filter });
    return orders;
  }

  async adminUpdateStatus(id: number, status: OrderStatus, note?: string): Promise<Order> {
    const { order } = await this.api.patch<{ order: Order }>(`/admin/orders/${id}/status`, { status, note });
    return order;
  }

  adminStats(): Promise<AdminStats> {
    return this.api.get<AdminStats>('/admin/stats');
  }

  // ---------- helpers ----------

  private upsert(order: Order): void {
    this.notifyChanges([order]);
    this._orders.update((list) => {
      const exists = list.some((o) => o.id === order.id);
      return exists ? list.map((o) => (o.id === order.id ? order : o)) : [order, ...list];
    });
  }

  private notifyChanges(orders: Order[]): void {
    for (const order of orders) {
      const previous = this.knownStatus.get(order.id);
      this.knownStatus.set(order.id, order.status);
      if (previous && previous !== order.status && STATUS_MESSAGES[order.status]) {
        void this.notifications.notify(`${order.orderNumber} · ${order.statusLabel}`, STATUS_MESSAGES[order.status]!, order.id);
      }
    }
  }
}
