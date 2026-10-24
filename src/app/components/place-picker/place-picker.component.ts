import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';
import { Place } from '../../services/location.service';

/** Searchable list modal for picking a region, city or barangay. Dismisses with the chosen Place. */
@Component({
  selector: 'app-place-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonSearchbar, IonList, IonItem, IonLabel, IonSpinner],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons slot="end"><ion-button (click)="close()">Close</ion-button></ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar [(ngModel)]="term" [debounce]="120" placeholder="Search" class="tea-searchbar"></ion-searchbar>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="center-spinner" *ngIf="loading()"><ion-spinner name="crescent"></ion-spinner></div>
      <div class="picker-error" *ngIf="error()">
        <p>{{ error() }}</p>
        <ion-button fill="outline" shape="round" class="tea-btn--outline" (click)="fetch()">Try again</ion-button>
      </div>
      <ion-list lines="full">
        <ion-item button detail="false" *ngFor="let place of filtered().slice(0, 400)" (click)="choose(place)">
          <ion-label>
            {{ place.name }}
            <p *ngIf="place.sub">{{ place.sub }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <p class="picker-empty" *ngIf="!loading() && !error() && !filtered().length">No matches. Close this and type it instead.</p>
    </ion-content>
  `,
  styles: [
    `
      .picker-error, .picker-empty { padding: 24px; text-align: center; color: var(--ion-color-medium); font-size: 0.85rem; }
      ion-searchbar { padding: 4px 12px 8px; }
    `,
  ],
})
export class PlacePickerComponent implements OnInit {
  @Input() title = 'Choose';
  @Input() load!: () => Promise<Place[]>;

  private modal = inject(ModalController);
  private places = signal<Place[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private termValue = signal('');

  get term(): string {
    return this.termValue();
  }
  set term(value: string) {
    this.termValue.set(value ?? '');
  }

  readonly filtered = () => {
    const t = this.termValue().trim().toLowerCase();
    return t ? this.places().filter((p) => p.name.toLowerCase().includes(t) || p.sub?.toLowerCase().includes(t)) : this.places();
  };

  ngOnInit(): void {
    void this.fetch();
  }

  async fetch(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.places.set(await this.load());
    } catch {
      this.error.set("Couldn't load the list. Check your internet connection, or close this and type it instead.");
    } finally {
      this.loading.set(false);
    }
  }

  choose(place: Place): void {
    void this.modal.dismiss(place, 'select');
  }

  close(): void {
    void this.modal.dismiss(null, 'cancel');
  }
}
