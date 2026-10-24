import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonSearchbar,
  IonChip,
  IonIcon,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cafeOutline, cloudOfflineOutline } from 'ionicons/icons';
import { CATEGORIES } from '../../../data/products.data';
import { Product } from '../../../models/product.model';
import { ProductService } from '../../../services/product.service';
import { AuthService } from '../../../services/auth.service';
import { ProductCardComponent } from '../../../components/product-card/product-card.component';

addIcons({ 'cafe-outline': cafeOutline, 'cloud-offline-outline': cloudOfflineOutline });

@Component({
  selector: 'app-product-list',
  standalone: true,
  templateUrl: './product-list.page.html',
  styleUrls: ['./product-list.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ProductCardComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonSearchbar,
    IonChip,
    IonIcon,
    IonLabel,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class ProductListPage {
  readonly productService = inject(ProductService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  categories = ['All', ...CATEGORIES];
  activeCategory = 'All';
  searchTerm = '';

  ionViewWillEnter(): void {
    // "About Our Products" links here with ?category=…
    const category = this.route.snapshot.queryParamMap.get('category');
    if (category && this.categories.includes(category)) this.activeCategory = category;
  }

  get allProducts(): Product[] {
    return this.productService.products();
  }

  get filteredProducts(): Product[] {
    return this.allProducts.filter((p) => {
      const matchesCategory = this.activeCategory === 'All' || p.category === this.activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(this.searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }

  selectCategory(category: string): void {
    this.activeCategory = category;
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.productService.refresh(this.auth.isAdmin());
    (event.target as HTMLIonRefresherElement).complete();
  }
}
