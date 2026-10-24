import { Injectable, computed, inject, signal } from '@angular/core';
import { Product } from '../models/product.model';
import { PRODUCTS as SEED_PRODUCTS } from '../data/products.data';
import { ApiService, apiErrorMessage } from './api.service';
import { StorageService } from './storage.service';

const CACHE_KEY = 'tearush_products_cache';

/**
 * Central product store. The menu comes from the TeaRush API; the last
 * successful copy is cached on the device so the menu still shows offline,
 * and the built-in 30-product catalog is used before the first sync.
 * Admin CRUD (Manage Products) goes straight to the API.
 */
@Injectable({ providedIn: 'root' })
export class ProductService {
  private api = inject(ApiService);
  private storage = inject(StorageService);

  private readonly _all = signal<Product[]>(SEED_PRODUCTS);

  /** Everything loaded, including products hidden from the menu (admins only). */
  readonly allProducts = this._all.asReadonly();
  /** Products customers can order. */
  readonly products = computed(() => this._all().filter((p) => p.available !== false));
  readonly loading = signal(false);
  /** Set when the last refresh failed; the menu is then the cached/built-in copy. */
  readonly error = signal<string | null>(null);
  readonly synced = signal(false);

  readonly categories = computed(() => Array.from(new Set(this.products().map((p) => p.category))));

  async init(): Promise<void> {
    const cached = await this.storage.get<Product[]>(CACHE_KEY);
    if (Array.isArray(cached) && cached.length) this._all.set(cached);
  }

  /** Fetches the latest menu. Admins also get hidden products. */
  async refresh(includeHidden = false): Promise<void> {
    this.loading.set(true);
    try {
      const { products } = await this.api.get<{ products: Product[] }>('/products', includeHidden ? { all: '1' } : undefined);
      this._all.set(products);
      this.error.set(null);
      this.synced.set(true);
      await this.storage.set(CACHE_KEY, products.filter((p) => p.available !== false));
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  getById(id: string): Product | undefined {
    return this._all().find((p) => p.id === id);
  }

  async addProduct(input: Omit<Product, 'id'>): Promise<Product> {
    const { product } = await this.api.post<{ product: Product }>('/products', input);
    this._all.update((list) => [...list, product]);
    return product;
  }

  async updateProduct(id: string, changes: Omit<Product, 'id'>): Promise<Product> {
    const { product } = await this.api.put<{ product: Product }>(`/products/${encodeURIComponent(id)}`, changes);
    this._all.update((list) => list.map((p) => (p.id === id ? product : p)));
    return product;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.api.delete(`/products/${encodeURIComponent(id)}`);
    this._all.update((list) => list.filter((p) => p.id !== id));
  }

  /** Restores the original 30-item catalog on the server. */
  async resetToSeed(): Promise<void> {
    const { products } = await this.api.post<{ products: Product[] }>('/products/reset');
    this._all.set(products);
  }
}
