import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonIcon,
  IonButton,
  IonFooter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cafeOutline, removeCircleOutline, addCircleOutline, trashOutline, cartOutline, pricetagOutline } from 'ionicons/icons';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { ShopService } from '../../services/shop.service';
import { NativeService } from '../../services/native.service';
import { PesoPipe } from '../../core/peso.pipe';

addIcons({
  'cafe-outline': cafeOutline,
  'remove-circle-outline': removeCircleOutline,
  'add-circle-outline': addCircleOutline,
  'trash-outline': trashOutline,
  'cart-outline': cartOutline,
  'pricetag-outline': pricetagOutline,
});

@Component({
  selector: 'app-cart',
  standalone: true,
  templateUrl: './cart.page.html',
  styleUrls: ['./cart.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    PesoPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonIcon,
    IonButton,
    IonFooter,
  ],
})
export class CartPage {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  private shop = inject(ShopService);
  private native = inject(NativeService);
  private router = inject(Router);

  get deliveryFee(): number {
    return this.shop.deliveryFee();
  }

  get total(): number {
    return this.cart.items().length ? this.cart.subtotal() + this.deliveryFee : 0;
  }

  increment(id: string, currentQty: number): void {
    this.native.tap();
    this.cart.updateQuantity(id, currentQty + 1);
  }

  decrement(id: string, currentQty: number): void {
    this.native.tap();
    this.cart.updateQuantity(id, currentQty - 1);
  }

  remove(id: string): void {
    this.cart.removeItem(id);
  }

  checkout(): void {
    // Guests are sent to log in first (authGuard), then straight back to checkout.
    void this.router.navigateByUrl('/checkout');
  }

  hideImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
