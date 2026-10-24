import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  IonItem,
  IonInput,
  IonTextarea,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  callOutline,
  mailOutline,
  locationOutline,
  timeOutline,
  sendOutline,
  checkmarkCircle,
  helpCircleOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { CONTACT } from '../../data/company.data';
import { ApiService, apiErrorMessage } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { NativeService } from '../../services/native.service';

addIcons({
  'call-outline': callOutline,
  'mail-outline': mailOutline,
  'location-outline': locationOutline,
  'time-outline': timeOutline,
  'send-outline': sendOutline,
  'checkmark-circle': checkmarkCircle,
  'help-circle-outline': helpCircleOutline,
  'chevron-forward-outline': chevronForwardOutline,
});

@Component({
  selector: 'app-contact',
  standalone: true,
  templateUrl: './contact.page.html',
  styleUrls: ['./contact.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonIcon,
    IonButton,
    IonItem,
    IonInput,
    IonTextarea,
    IonSpinner,
  ],
})
export class ContactPage {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private native = inject(NativeService);

  readonly contact = CONTACT;
  readonly telLink = `tel:${CONTACT.phone.replace(/\s/g, '')}`;
  readonly mailLink = `mailto:${CONTACT.email}?subject=${encodeURIComponent('TeaRush inquiry')}`;

  form = { name: '', email: '', phone: '', subject: '', message: '' };
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  ionViewWillEnter(): void {
    const user = this.auth.user();
    if (user) {
      this.form.name ||= user.name;
      this.form.email ||= user.email;
      this.form.phone ||= user.phone;
    }
  }

  async send(): Promise<void> {
    const { name, email, message } = this.form;
    if (!name.trim() || !email.trim() || !message.trim()) {
      this.error.set('Please fill in your name, email and message.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      this.error.set('Please enter a valid email address.');
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      await this.api.post('/messages', this.form);
      this.native.success();
      this.sent.set(true);
      this.form.subject = '';
      this.form.message = '';
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.sending.set(false);
    }
  }

  writeAnother(): void {
    this.sent.set(false);
  }
}
