import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonIcon,
  IonButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { leafOutline, waterOutline, ellipseOutline, sparklesOutline, chevronForwardOutline, cafeOutline } from 'ionicons/icons';
import { CATEGORIES } from '../../data/products.data';
import { ICE_LEVELS, SIZES, SIZE_SURCHARGE, SUGAR_LEVELS, TOPPINGS, ProductCategory } from '../../models/product.model';
import { ProductService } from '../../services/product.service';

addIcons({
  'leaf-outline': leafOutline,
  'water-outline': waterOutline,
  'ellipse-outline': ellipseOutline,
  'sparkles-outline': sparklesOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'cafe-outline': cafeOutline,
});

const LINE_INFO: Record<ProductCategory, { emoji: string; text: string }> = {
  Signature: { emoji: '⭐', text: 'Our house specialties — brown sugar, Okinawa, Hokkaido and local ube, finished with pearls or milk foam.' },
  'Milk Tea Classics': { emoji: '🧋', text: 'Timeless favorites like Classic, Wintermelon, Taro, Matcha and Thai milk tea, brewed fresh daily.' },
  'Fruit Tea': { emoji: '🍓', text: 'Light and refreshing green and oolong teas shaken with real fruit, Yakult and popping boba.' },
  'Cheese Foam': { emoji: '🧀', text: 'Teas crowned with our whipped, lightly salted cheese foam — sip it through the cap.' },
};

@Component({
  selector: 'app-about-products',
  standalone: true,
  templateUrl: './about-products.page.html',
  styleUrls: ['./about-products.page.scss'],
  imports: [CommonModule, RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonContent, IonIcon, IonButton],
})
export class AboutProductsPage {
  private productService = inject(ProductService);

  readonly toppings = TOPPINGS;
  readonly sugarLevels = SUGAR_LEVELS;
  readonly iceLevels = ICE_LEVELS;
  readonly sizes = SIZES.map((size) => ({ size, surcharge: SIZE_SURCHARGE[size] }));

  readonly ingredients = [
    { icon: 'leaf-outline', title: 'Real tea leaves', text: 'Ceylon black, jasmine green and roasted oolong, brewed in small batches throughout the day.' },
    { icon: 'water-outline', title: 'Fresh milk', text: 'Fresh, oat or condensed milk — or none at all for our fruit teas.' },
    { icon: 'ellipse-outline', title: 'Chewy pearls', text: 'Tapioca pearls slow-cooked in brown sugar syrup, made fresh every few hours.' },
    { icon: 'sparkles-outline', title: 'Your sweetness', text: 'Pick 0% to 100% sugar and your ice level on every cup.' },
  ];

  readonly lines = computed(() => {
    const products = this.productService.products();
    return CATEGORIES.map((category) => {
      const items = products.filter((p) => p.category === category);
      return {
        category,
        ...LINE_INFO[category],
        count: items.length,
        from: items.length ? Math.min(...items.map((p) => p.price)) : null,
      };
    });
  });

  readonly totalProducts = computed(() => this.productService.products().length);
}
