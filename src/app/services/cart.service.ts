import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { OrderItem, OrderLineInput } from '../models/order.model';
import { SIZE_SURCHARGE, TOPPINGS, ProductSize, CUSTOM_DRINK } from '../models/product.model';
import { StorageService } from './storage.service';

export interface CartItem {
  id: string;            // unique cart line id
  productId: string;
  name: string;
  image: string;
  size: string;
  sugar: string;
  ice: string;
  toppings: string[];    // display names
  toppingIds: string[];  // what the API prices
  options?: { teaBase?: string; milk?: string };
  unitPrice: number;     // shown in the app; the server recomputes the real price
  quantity: number;
}

const CART_KEY = 'tearush_cart';
const PROMO_KEY = 'tearush_cart_promo';

@Injectable({ providedIn: 'root' })
export class CartService {
  private storage = inject(StorageService);
  private ready = false;

  private readonly _items = signal<CartItem[]>([]);

  readonly items = this._items.asReadonly();
  /** Promo code chosen on the Promotions page, applied at checkout. */
  readonly promoCode = signal<string>('');

  readonly itemCount = computed(() =>
    this._items().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly subtotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  );

  constructor() {
    effect(() => {
      const items = this._items();
      const promo = this.promoCode();
      if (!this.ready) return;
      void this.storage.set(CART_KEY, items);
      void this.storage.set(PROMO_KEY, promo);
    });
  }

  async init(): Promise<void> {
    const [items, promo] = await Promise.all([
      this.storage.get<CartItem[]>(CART_KEY),
      this.storage.get<string>(PROMO_KEY),
    ]);
    if (Array.isArray(items)) this._items.set(items.filter((i) => Array.isArray(i.toppingIds)));
    if (promo) this.promoCode.set(promo);
    this.ready = true;
  }

  addItem(item: Omit<CartItem, 'id'>): void {
    const id = `${item.productId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this._items.update((items) => [...items, { ...item, id }]);
  }

  updateQuantity(id: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(id);
      return;
    }
    this._items.update((items) =>
      items.map((i) => (i.id === id ? { ...i, quantity: Math.min(quantity, 50) } : i))
    );
  }

  removeItem(id: string): void {
    this._items.update((items) => items.filter((i) => i.id !== id));
  }

  clear(): void {
    this._items.set([]);
    this.promoCode.set('');
  }

  /** Cart lines in the shape the orders API expects. */
  toOrderLines(): OrderLineInput[] {
    return this._items().map((i) => ({
      productId: i.productId,
      size: i.size,
      sugar: i.sugar,
      ice: i.ice,
      toppingIds: i.toppingIds,
      options: i.options,
      quantity: i.quantity,
    }));
  }

  /** Puts the items of a past order back in the cart ("Reorder"). */
  addFromOrder(items: OrderItem[], currentPrice: (productId: string) => number | undefined): number {
    let added = 0;
    for (const item of items) {
      const base = item.productId === CUSTOM_DRINK.id ? CUSTOM_DRINK.basePrice : currentPrice(item.productId);
      if (base === undefined) continue; // product no longer on the menu
      const toppingsTotal = item.toppingIds.reduce((sum, id) => sum + (TOPPINGS.find((t) => t.id === id)?.price ?? 0), 0);
      this.addItem({
        productId: item.productId,
        name: item.name,
        image: item.image,
        size: item.size,
        sugar: item.sugar,
        ice: item.ice,
        toppings: item.toppings,
        toppingIds: item.toppingIds,
        options: item.options,
        unitPrice: base + (SIZE_SURCHARGE[item.size as ProductSize] ?? 0) + toppingsTotal,
        quantity: item.quantity,
      });
      added++;
    }
    return added;
  }
}
