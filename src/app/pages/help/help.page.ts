import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, callOutline, timeOutline, helpCircleOutline } from 'ionicons/icons';
import { CONTACT } from '../../data/company.data';

addIcons({
  'mail-outline': mailOutline,
  'call-outline': callOutline,
  'time-outline': timeOutline,
  'help-circle-outline': helpCircleOutline,
});

@Component({
  selector: 'app-help',
  standalone: true,
  templateUrl: './help.page.html',
  styleUrls: ['./help.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonIcon,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
  ],
})
export class HelpPage {
  contact = CONTACT;

  faqs = [
    {
      q: 'Which payment methods can I use?',
      a: 'GCash, Maya, credit/debit cards and GrabPay through PayMongo, plus cash on delivery or cash on pickup. Online payments open PayMongo’s secure page — TeaRush never sees your card or wallet details.',
    },
    {
      q: 'I paid but my order still says “Awaiting payment”.',
      a: 'Open the order and tap “I already paid — check again”. Payments usually confirm within a few seconds. If it still hasn’t updated after a few minutes, contact us with your order number and the payment reference from GCash/Maya/your bank.',
    },
    {
      q: 'Can I cancel my order?',
      a: 'Yes, as long as the shop hasn’t started preparing it and it hasn’t been paid online. Open the order and tap “Cancel order”. For paid orders, contact us and we’ll cancel and refund it.',
    },
    {
      q: 'How much is delivery?',
      a: 'Delivery is a flat ₱49. Use code FREESHIP on orders of ₱250 or more for free delivery, or choose Pickup to skip the fee entirely.',
    },
    {
      q: 'How do promo codes work?',
      a: 'Copy a code from Promotions (or tap “Use at checkout”) and apply it on the checkout screen. Each code has its own rules — e.g. TEARUSH20 is for your first order only.',
    },
    {
      q: 'How do I track my order?',
      a: 'Go to Order History and tap your order. The status updates live, and with notifications on, we’ll alert you when it’s being prepared, on the way, or ready for pickup.',
    },
    {
      q: 'How do I delete my account?',
      a: 'Go to My Account → Delete my account. This removes your login and saved addresses; past orders are kept anonymously for the shop’s records.',
    },
  ];
}
