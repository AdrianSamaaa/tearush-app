import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cafeOutline, starSharp, add } from 'ionicons/icons';
import { Product } from '../../models/product.model';
import { CartService } from '../../services/cart.service';
import { NativeService } from '../../services/native.service';

addIcons({ 'cafe-outline': cafeOutline, 'star-sharp': starSharp, add });

/** Menu card: tap to open the drink, or "+" to add a regular cup straight to the cart. */
@Component({
  selector: 'app-product-card',
  standalone: true,
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss'],
  imports: [CommonModule, RouterLink, IonIcon],
})
export class ProductCardComponent {
  readonly product = input.required<Product>();

  private cart = inject(CartService);
  private native = inject(NativeService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  async quickAdd(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const p = this.product();
    this.native.tap();
    this.cart.addItem({
      productId: p.id,
      name: p.name,
      image: p.image,
      size: 'Medium',
      sugar: '100%',
      ice: 'Normal Ice',
      toppings: [],
      toppingIds: [],
      unitPrice: p.price,
      quantity: 1,
    });
    const toast = await this.toastCtrl.create({
      message: `${p.name} added to cart`,
      duration: 1400,
      color: 'tertiary',
      position: 'bottom',
      buttons: [{ text: 'View cart', handler: () => void this.router.navigateByUrl('/cart') }],
    });
    await toast.present();
  }

  hideImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
