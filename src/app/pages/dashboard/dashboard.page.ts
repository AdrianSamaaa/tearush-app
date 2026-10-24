import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonIcon,
  IonContent,
  IonBadge,
  IonSearchbar,
  IonChip,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cartOutline,
  cafeOutline,
  colorWandOutline,
  starSharp,
  arrowForwardOutline,
  cloudOfflineOutline,
  chevronForwardOutline,
  timeOutline,
  bicycleOutline,
  bagCheckOutline,
  cardOutline,
  receiptOutline,
  checkmarkCircle,
  closeCircleOutline,
} from 'ionicons/icons';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { ShopService } from '../../services/shop.service';
import { STATUS_ICONS } from '../../models/order.model';
import { Product } from '../../models/product.model';
import { CATEGORIES } from '../../data/products.data';
import { ProductCardComponent } from '../../components/product-card/product-card.component';

addIcons({
  'cart-outline': cartOutline,
  'cafe-outline': cafeOutline,
  'color-wand-outline': colorWandOutline,
  'star-sharp': starSharp,
  'arrow-forward-outline': arrowForwardOutline,
  'cloud-offline-outline': cloudOfflineOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'time-outline': timeOutline,
  'bicycle-outline': bicycleOutline,
  'bag-check-outline': bagCheckOutline,
  'card-outline': cardOutline,
  'receipt-outline': receiptOutline,
  'checkmark-circle': checkmarkCircle,
  'close-circle-outline': closeCircleOutline,
});

/** Home screen — opens straight onto the product list. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ProductCardComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonButton,
    IonIcon,
    IonContent,
    IonBadge,
    IonSearchbar,
    IonChip,
    IonLabel,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class DashboardPage {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly productService = inject(ProductService);
  private orders = inject(OrderService);
  private shop = inject(ShopService);

  readonly statusIcons = STATUS_ICONS;
  readonly categories = ['All', ...CATEGORIES];
  activeCategory = 'All';
  searchTerm = '';

  readonly bestSellers = computed(() => this.productService.products().filter((p) => p.popular).slice(0, 6));

  /** Most recent order that's still in progress, shown as a tracking card. */
  readonly activeOrder = computed(() => this.orders.activeOrders()[0] ?? null);

  /** Featured promo (falls back to the welcome offer until promos load). */
  readonly featuredPromo = computed(
    () => this.shop.promos()[0] ?? { code: 'TEARUSH20', title: '20% off your first order' }
  );

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  });

  get isFiltering(): boolean {
    return this.activeCategory !== 'All' || this.searchTerm.trim() !== '';
  }

  get filteredProducts(): Product[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.productService.products().filter(
      (p) =>
        (this.activeCategory === 'All' || p.category === this.activeCategory) &&
        (!term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term))
    );
  }

  selectCategory(category: string): void {
    this.activeCategory = category;
  }

  async refresh(event: CustomEvent): Promise<void> {
    await Promise.all([
      this.productService.refresh(this.auth.isAdmin()),
      this.shop.loadPromos(),
      this.auth.isLoggedIn() ? this.orders.load() : Promise.resolve(),
    ]);
    (event.target as HTMLIonRefresherElement).complete();
  }

  hideImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
