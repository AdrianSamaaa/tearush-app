import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonSearchbar,
  IonIcon,
  IonButton,
  IonFab,
  IonFabButton,
  IonModal,
  IonItem,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonCheckbox,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cafeOutline,
  add,
  createOutline,
  trashOutline,
  closeOutline,
  saveOutline,
  refreshOutline,
  starSharp,
  eyeOffOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { ProductService } from '../../services/product.service';
import { apiErrorMessage } from '../../services/api.service';
import { Product, ProductCategory } from '../../models/product.model';
import { CATEGORIES } from '../../data/products.data';

addIcons({
  'cafe-outline': cafeOutline,
  add,
  'create-outline': createOutline,
  'trash-outline': trashOutline,
  'close-outline': closeOutline,
  'save-outline': saveOutline,
  'refresh-outline': refreshOutline,
  'star-sharp': starSharp,
  'eye-off-outline': eyeOffOutline,
  'alert-circle-outline': alertCircleOutline,
});

/** Blank template used when opening the form to add a new product. */
function emptyForm(): Omit<Product, 'id'> {
  return {
    name: '',
    category: 'Milk Tea Classics',
    price: 0,
    description: '',
    image: '',
    popular: false,
    rating: undefined,
    available: true,
  };
}

@Component({
  selector: 'app-manage-products',
  standalone: true,
  templateUrl: './manage-products.page.html',
  styleUrls: ['./manage-products.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonSearchbar,
    IonIcon,
    IonButton,
    IonFab,
    IonFabButton,
    IonModal,
    IonItem,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonCheckbox,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class ManageProductsPage {
  readonly productService = inject(ProductService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  categories: ProductCategory[] = CATEGORIES;
  searchTerm = '';

  isModalOpen = false;
  editingId: string | null = null;
  form: Omit<Product, 'id'> = emptyForm();
  readonly saving = signal(false);

  ionViewWillEnter(): void {
    // Admins also see products hidden from the menu.
    void this.productService.refresh(true);
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.productService.refresh(true);
    (event.target as HTMLIonRefresherElement).complete();
  }

  get products(): Product[] {
    const term = this.searchTerm.toLowerCase();
    return this.productService
      .allProducts()
      .filter((p) => p.name.toLowerCase().includes(term));
  }

  get modalTitle(): string {
    return this.editingId ? 'Edit Product' : 'Add Product';
  }

  /** Open the modal in "Add" mode with a blank form. */
  openAddForm(): void {
    this.editingId = null;
    this.form = emptyForm();
    this.isModalOpen = true;
  }

  /** Open the modal in "Edit" mode, pre-filled with the selected product. */
  openEditForm(product: Product): void {
    this.editingId = product.id;
    const { id, ...rest } = product;
    this.form = { ...rest, available: rest.available !== false };
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  async save(): Promise<void> {
    const price = Number(this.form.price);
    if (!this.form.name.trim() || !(price > 0)) {
      await this.showAlert('Missing information', 'Please provide at least a product name and a price greater than 0.');
      return;
    }
    const rating = this.form.rating === undefined || this.form.rating === null || (this.form.rating as unknown) === ''
      ? undefined
      : Number(this.form.rating);
    const payload: Omit<Product, 'id'> = { ...this.form, name: this.form.name.trim(), price, rating };

    this.saving.set(true);
    try {
      if (this.editingId) {
        await this.productService.updateProduct(this.editingId, payload);
      } else {
        await this.productService.addProduct(payload);
      }
      this.isModalOpen = false;
      await this.toast(this.editingId ? 'Product updated' : 'Product added', 'tertiary');
    } catch (err) {
      await this.showAlert('Could not save', apiErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete(product: Product): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete product?',
      message: `This will remove "${product.name}" from the catalog. Past orders keep their own copy.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.productService.deleteProduct(product.id);
              await this.toast('Product deleted', 'danger');
            } catch (err) {
              await this.showAlert('Could not delete', apiErrorMessage(err));
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmReset(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Reset catalog?',
      message: 'This restores the original 30-product catalog and discards any edits.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reset',
          role: 'destructive',
          handler: async () => {
            try {
              await this.productService.resetToSeed();
              await this.toast('Catalog restored', 'tertiary');
            } catch (err) {
              await this.showAlert('Could not reset', apiErrorMessage(err));
            }
          },
        },
      ],
    });
    await alert.present();
  }

  hideImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  private async toast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 1400, color, position: 'bottom' });
    await toast.present();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({ header, message, buttons: ['OK'] });
    await alert.present();
  }
}
