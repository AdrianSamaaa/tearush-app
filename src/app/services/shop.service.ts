import { Injectable, inject, signal } from '@angular/core';
import { PaymentMethod } from '../models/order.model';
import { DELIVERY_FEE } from '../models/product.model';
import { ApiService, apiErrorMessage } from './api.service';
import { StorageService } from './storage.service';

export interface PaymentOption {
  value: PaymentMethod;
  label: string;
}

export interface Promo {
  code: string;
  title: string;
  description: string;
  expiry: string;
  accent: 'brown' | 'caramel' | 'leaf';
}

interface ShopConfig {
  paymentsEnabled: boolean;
  paymentMethods: PaymentOption[];
  deliveryFee: number;
}

const PROMOS_CACHE_KEY = 'tearush_promos_cache';

/** Store-wide settings from the server: live payment methods, delivery fee and promotions. */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private api = inject(ApiService);
  private storage = inject(StorageService);

  readonly paymentsEnabled = signal(false);
  readonly paymentMethods = signal<PaymentOption[]>([]);
  readonly deliveryFee = signal(DELIVERY_FEE);
  readonly configLoaded = signal(false);

  readonly promos = signal<Promo[]>([]);
  readonly promosError = signal<string | null>(null);

  async init(): Promise<void> {
    const cached = await this.storage.get<Promo[]>(PROMOS_CACHE_KEY);
    if (Array.isArray(cached)) this.promos.set(cached);
  }

  async loadConfig(): Promise<void> {
    try {
      const config = await this.api.get<ShopConfig>('/config');
      this.paymentsEnabled.set(config.paymentsEnabled);
      this.paymentMethods.set(config.paymentMethods);
      this.deliveryFee.set(config.deliveryFee);
      this.configLoaded.set(true);
    } catch {
      /* keep defaults — checkout will offer cash only until the server is reachable */
    }
  }

  async loadPromos(): Promise<void> {
    try {
      const { promos } = await this.api.get<{ promos: Promo[] }>('/promos');
      this.promos.set(promos);
      this.promosError.set(null);
      await this.storage.set(PROMOS_CACHE_KEY, promos);
    } catch (err) {
      this.promosError.set(apiErrorMessage(err));
    }
  }
}
