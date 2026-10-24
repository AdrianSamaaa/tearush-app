import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
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
import { colorWandOutline } from 'ionicons/icons';
import { SIZES, SUGAR_LEVELS, ICE_LEVELS, TOPPINGS, ProductSize, SIZE_SURCHARGE, CUSTOM_DRINK } from '../../models/product.model';
import { CartService } from '../../services/cart.service';
import { NativeService } from '../../services/native.service';

addIcons({ 'color-wand-outline': colorWandOutline });

const BASE_PRICE = CUSTOM_DRINK.basePrice;
const MILK_OPTIONS = [...CUSTOM_DRINK.milks];
const TEA_BASES = [...CUSTOM_DRINK.teaBases];

@Component({
  selector: 'app-customize',
  standalone: true,
  templateUrl: './customize.page.html',
  styleUrls: ['./customize.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
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
export class CustomizePage {
  teaBases = TEA_BASES;
  milkOptions = MILK_OPTIONS;
  sizes = SIZES;
  sugarLevels = SUGAR_LEVELS;
  iceLevels = ICE_LEVELS;
  toppings = TOPPINGS;

  selectedTeaBase = TEA_BASES[0];
  selectedMilk = MILK_OPTIONS[0];
  selectedSize: ProductSize = 'Medium';
  selectedSugar = '100%';
  selectedIce = 'Normal Ice';
  selectedToppings: string[] = [];

  constructor(
    private cart: CartService,
    private toastCtrl: ToastController,
    private router: Router,
    private native: NativeService
  ) {}

  toggleTopping(id: string, checked: boolean): void {
    this.selectedToppings = checked
      ? [...this.selectedToppings, id]
      : this.selectedToppings.filter((t) => t !== id);
  }

  get toppingsTotal(): number {
    return this.selectedToppings.reduce((sum, id) => {
      const topping = this.toppings.find((t) => t.id === id);
      return sum + (topping?.price ?? 0);
    }, 0);
  }

  get sizeSurcharge(): number {
    return SIZE_SURCHARGE[this.selectedSize];
  }

  get totalPrice(): number {
    return BASE_PRICE + this.sizeSurcharge + this.toppingsTotal;
  }

  async addToCart(): Promise<void> {
    const name = `Custom ${this.selectedTeaBase}`;
    this.native.tap();
    this.cart.addItem({
      productId: CUSTOM_DRINK.id,
      name,
      image: CUSTOM_DRINK.image,
      size: this.selectedSize,
      sugar: this.selectedSugar,
      ice: this.selectedIce,
      toppings: this.selectedToppings.map((id) => this.toppings.find((t) => t.id === id)?.name ?? id),
      toppingIds: [...this.selectedToppings],
      options: { teaBase: this.selectedTeaBase, milk: this.selectedMilk },
      unitPrice: this.totalPrice,
      quantity: 1,
    });

    const toast = await this.toastCtrl.create({
      message: 'Your custom drink was added to cart',
      duration: 1600,
      color: 'tertiary',
      position: 'bottom',
    });
    await toast.present();
    this.router.navigateByUrl('/dashboard');
  }
}

