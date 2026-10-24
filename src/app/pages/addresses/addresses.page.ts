import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonButton,
  IonFab,
  IonFabButton,
  IonModal,
  IonItem,
  IonLabel,
  IonInput,
  IonCheckbox,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add,
  locationOutline,
  createOutline,
  trashOutline,
  closeOutline,
  starOutline,
  star,
  alertCircleOutline,
  navigateOutline,
  mapOutline,
} from 'ionicons/icons';
import { Address, AddressInput, formatAddress } from '../../models/user.model';
import { AddressService } from '../../services/address.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../services/api.service';
import { LocationService, Place } from '../../services/location.service';
import { PlacePickerComponent } from '../../components/place-picker/place-picker.component';

addIcons({
  add,
  'location-outline': locationOutline,
  'create-outline': createOutline,
  'trash-outline': trashOutline,
  'close-outline': closeOutline,
  'star-outline': starOutline,
  star,
  'alert-circle-outline': alertCircleOutline,
  'navigate-outline': navigateOutline,
  'map-outline': mapOutline,
});

const LABELS = ['Home', 'Work', 'Other'];

@Component({
  selector: 'app-addresses',
  standalone: true,
  templateUrl: './addresses.page.html',
  styleUrls: ['./addresses.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonIcon,
    IonButton,
    IonFab,
    IonFabButton,
    IonModal,
    IonItem,
    IonLabel,
    IonInput,
    IonCheckbox,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
  ],
})
export class AddressesPage {
  readonly service = inject(AddressService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private location = inject(LocationService);

  readonly labels = LABELS;
  readonly formatAddress = formatAddress;

  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly locating = signal(false);
  readonly formError = signal<string | null>(null);
  isModalOpen = false;
  editingId: number | null = null;
  form: AddressInput = this.emptyForm();
  /** PSGC codes of the picked region/city (to load the next list). */
  regionCode: string | null = null;
  cityCode: string | null = null;

  ionViewWillEnter(): void {
    void this.load();
    if (this.route.snapshot.queryParamMap.get('add')) this.openAdd();
  }

  async load(): Promise<void> {
    try {
      await this.service.load();
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(apiErrorMessage(err));
    }
  }

  private emptyForm(): AddressInput {
    const user = this.auth.user();
    return {
      label: 'Home',
      recipient: user?.name ?? '',
      phone: user?.phone ?? '',
      line1: '',
      barangay: '',
      city: '',
      province: '',
      region: '',
      postalCode: '',
      latitude: null,
      longitude: null,
      notes: '',
      isDefault: false,
    };
  }

  openAdd(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.regionCode = this.cityCode = null;
    this.formError.set(null);
    this.isModalOpen = true;
  }

  openEdit(address: Address): void {
    this.editingId = address.id;
    const { id, ...rest } = address;
    this.form = { region: '', latitude: null, longitude: null, ...rest };
    this.regionCode = this.cityCode = null;
    this.formError.set(null);
    this.isModalOpen = true;
  }

  // ---------- address API (PSGC lists + GPS) ----------

  private async pick(title: string, load: () => Promise<Place[]>): Promise<Place | null> {
    const modal = await this.modalCtrl.create({ component: PlacePickerComponent, componentProps: { title, load } });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<Place>();
    return role === 'select' ? data ?? null : null;
  }

  async pickRegion(): Promise<void> {
    const place = await this.pick('Choose region', () => this.location.regions());
    if (!place) return;
    if (place.name !== this.form.region) {
      Object.assign(this.form, { city: '', barangay: '', province: '' });
      this.cityCode = null;
    }
    this.form.region = place.name;
    this.regionCode = place.code;
  }

  async pickCity(): Promise<void> {
    const regionCode = await this.resolveRegionCode();
    if (!regionCode) {
      await this.toast('Choose your region first.');
      return;
    }
    const place = await this.pick('Choose city / municipality', () => this.location.citiesOf(regionCode));
    if (!place) return;
    if (place.name !== this.form.city) this.form.barangay = '';
    this.form.city = place.name;
    this.cityCode = place.code;
    this.form.province = (await this.location.provinceFor(place).catch(() => '')) || this.form.province;
  }

  async pickBarangay(): Promise<void> {
    const cityCode = await this.resolveCityCode();
    if (!cityCode) {
      await this.toast('Choose your city or municipality first.');
      return;
    }
    const place = await this.pick('Choose barangay', () => this.location.barangaysOf(cityCode));
    if (place) this.form.barangay = place.name;
  }

  /** Finds the PSGC code for a region typed or saved earlier. */
  private async resolveRegionCode(): Promise<string | null> {
    if (this.regionCode) return this.regionCode;
    const name = this.form.region?.trim().toLowerCase();
    if (!name) return null;
    const match = (await this.location.regions().catch(() => [])).find((r) => r.name.toLowerCase() === name || r.sub?.toLowerCase() === name);
    return (this.regionCode = match?.code ?? null);
  }

  private async resolveCityCode(): Promise<string | null> {
    if (this.cityCode) return this.cityCode;
    const regionCode = await this.resolveRegionCode();
    const name = this.form.city.trim().toLowerCase();
    if (!regionCode || !name) return null;
    const match = (await this.location.citiesOf(regionCode).catch(() => [])).find(
      (c) => c.name.toLowerCase() === name || c.name.toLowerCase().replace(/^city of /, '') === name.replace(/ city$/, '')
    );
    return (this.cityCode = match?.code ?? null);
  }

  async useMyLocation(): Promise<void> {
    this.locating.set(true);
    this.formError.set(null);
    try {
      const found = await this.location.detectAddress();
      this.form = {
        ...this.form,
        line1: found.line1 || this.form.line1,
        barangay: found.barangay || this.form.barangay,
        city: found.city || this.form.city,
        province: found.province || this.form.province,
        region: found.region || this.form.region,
        postalCode: found.postalCode || this.form.postalCode,
        latitude: found.latitude,
        longitude: found.longitude,
      };
      this.regionCode = this.cityCode = null;
      await this.toast('Address filled from your location — please check the details.');
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : 'Could not get your location.');
    } finally {
      this.locating.set(false);
    }
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  async save(): Promise<void> {
    const f = this.form;
    if (!f.recipient.trim() || !f.phone.trim() || !f.line1.trim() || !f.city.trim()) {
      this.formError.set('Please fill in the recipient, mobile number, street and city.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      if (this.editingId) {
        await this.service.update(this.editingId, f);
      } else {
        await this.service.add(f);
      }
      this.isModalOpen = false;
      await this.toast(this.editingId ? 'Address updated' : 'Address saved');
    } catch (err) {
      this.formError.set(apiErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async makeDefault(address: Address): Promise<void> {
    if (address.isDefault) return;
    try {
      const { id, ...rest } = address;
      await this.service.update(id, { ...rest, isDefault: true });
      await this.toast(`${address.label} is now your default address`);
    } catch (err) {
      await this.toast(apiErrorMessage(err));
    }
  }

  async confirmDelete(address: Address): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete address?',
      message: `Remove "${address.label}" (${address.line1})?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(address.id);
            } catch (err) {
              await this.toast(apiErrorMessage(err));
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 1600, color: 'tertiary', position: 'bottom' });
    await toast.present();
  }
}
