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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cafeOutline,
  colorWandOutline,
  pricetagsOutline,
  locationOutline,
  shieldCheckmarkOutline,
  flagOutline,
} from 'ionicons/icons';

addIcons({
  'cafe-outline': cafeOutline,
  'color-wand-outline': colorWandOutline,
  'pricetags-outline': pricetagsOutline,
  'location-outline': locationOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'flag-outline': flagOutline,
});

@Component({
  selector: 'app-about',
  standalone: true,
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  imports: [CommonModule, RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonContent, IonIcon],
})
export class AboutPage {
  features = [
    { icon: 'cafe-outline', title: 'Browse the full menu', text: 'Explore every TeaRush milk tea, fruit tea, and cheese-foam drink in one place.' },
    { icon: 'color-wand-outline', title: 'Customize every cup', text: 'Choose your size, sugar level, ice level, and toppings, or build a drink from scratch.' },
    { icon: 'pricetags-outline', title: 'Exclusive promotions', text: 'Unlock vouchers and limited-time deals made for TeaRush regulars.' },
    { icon: 'location-outline', title: 'Track your order', text: 'Follow your order from preparation to delivery, right from the app.' },
    { icon: 'shield-checkmark-outline', title: 'Manage your account', text: 'Save your addresses, payment methods, and order history securely.' },
  ];
}

