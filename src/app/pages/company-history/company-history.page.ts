import { Component } from '@angular/core';
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
import { leafOutline, colorWandOutline, flashOutline, heartOutline, flagOutline, eyeOutline } from 'ionicons/icons';
import { COMPANY } from '../../data/company.data';

addIcons({
  'leaf-outline': leafOutline,
  'color-wand-outline': colorWandOutline,
  'flash-outline': flashOutline,
  'heart-outline': heartOutline,
  'flag-outline': flagOutline,
  'eye-outline': eyeOutline,
});

@Component({
  selector: 'app-company-history',
  standalone: true,
  templateUrl: './company-history.page.html',
  styleUrls: ['./company-history.page.scss'],
  imports: [CommonModule, RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonContent, IonIcon, IonButton],
})
export class CompanyHistoryPage {
  company = COMPANY;
}
