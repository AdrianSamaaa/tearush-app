import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonCheckbox,
  IonIcon,
  IonButton,
  IonFooter,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cafeOutline, removeCircleOutline, addCircleOutline, starSharp } from 'ionicons/icons';
import {
  Product,
  SIZES,
  SIZE_SURCHARGE,
  SUGAR_LEVELS,
  ICE_LEVELS,
  TOPPINGS,
  ProductSize,
} from '../../../models/product.model';
import { CartService } from '../../../services/cart.service';
import { ProductService } from '../../../services/product.service';
import { NativeService } from '../../../services/native.service';

addIcons({
  'cafe-outline': cafeOutline,
  'remove-circle-outline': removeCircleOutline,
  'add-circle-outline': addCircleOutline,
  'star-sharp': starSharp,
});

@Component({
  selector: 'app-product-detail',
  standalone: true,
  templateUrl: './product-detail.page.html',
  styleUrls: ['./product-detail.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonCheckbox,
    IonIcon,
    IonButton,
    IonFooter,
  ],
})
export class ProductDetailPage implements OnInit {
  private readonly productId = signal('');
  /** Reactive, so the page fills in if the menu finishes loading after navigation. */
  private readonly productSig = computed(() => this.productService.getById(this.productId()));

  get product(): Product | undefined {
    return this.productSig();
  }

  sizes = SIZES;
  sugarLevels = SUGAR_LEVELS;
  iceLevels = ICE_LEVELS;
  toppings = TOPPINGS;

  selectedSize: ProductSize = 'Medium';
  selectedSugar: string = '100%';
  selectedIce: string = 'Normal Ice';
  selectedToppings: string[] = [];
  quantity = 1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cart: CartService,
    private productService: ProductService,
    private toastCtrl: ToastController,
    private native: NativeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.productId.set(this.route.snapshot.paramMap.get('id') ?? '');
    if (!this.product) {
      // Maybe a product added since the menu was cached — fetch once before giving up.
      await this.productService.refresh();
      if (!this.product) this.router.navigateByUrl('/products', { replaceUrl: true });
    }
  }

  toggleTopping(id: string, checked: boolean): void {
    if (checked) {
      this.selectedToppings = [...this.selectedToppings, id];
    } else {
      this.selectedToppings = this.selectedToppings.filter((t) => t !== id);
    }
  }

  get toppingsTotal(): number {
    return this.selectedToppings.reduce((sum, id) => {
      const topping = this.toppings.find((t) => t.id === id);
      return sum + (topping?.price ?? 0);
    }, 0);
  }

  get unitPrice(): number {
    if (!this.product) return 0;
    return this.product.price + SIZE_SURCHARGE[this.selectedSize] + this.toppingsTotal;
  }

  get totalPrice(): number {
    return this.unitPrice * this.quantity;
  }

  changeQuantity(delta: number): void {
    this.quantity = Math.max(1, this.quantity + delta);
  }

  hideImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  async addToCart(): Promise<void> {
    if (!this.product) return;

    this.native.tap();
    this.cart.addItem({
      productId: this.product.id,
      name: this.product.name,
      image: this.product.image,
      size: this.selectedSize,
      sugar: this.selectedSugar,
      ice: this.selectedIce,
      toppings: this.selectedToppings.map(
        (id) => this.toppings.find((t) => t.id === id)?.name ?? id
      ),
      toppingIds: [...this.selectedToppings],
      unitPrice: this.unitPrice,
      quantity: this.quantity,
    });

    const toast = await this.toastCtrl.create({
      message: `${this.product.name} added to cart`,
      duration: 1600,
      color: 'tertiary',
      position: 'bottom',
    });
    await toast.present();
    this.router.navigateByUrl('/products');
  }
}

