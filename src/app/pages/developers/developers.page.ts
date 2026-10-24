import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { peopleOutline, personCircle } from 'ionicons/icons';
import { DEVELOPERS } from '../../data/developers.data';

addIcons({ 'people-outline': peopleOutline, 'person-circle': personCircle });

@Component({
  selector: 'app-developers',
  standalone: true,
  templateUrl: './developers.page.html',
  styleUrls: ['./developers.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonContent, IonIcon],
})
export class DevelopersPage {
  developers = DEVELOPERS;

  /** Swap a missing/broken photo for the built-in placeholder avatar. */
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = 'assets/photos/developers/placeholder-avatar.svg';
  }
}

