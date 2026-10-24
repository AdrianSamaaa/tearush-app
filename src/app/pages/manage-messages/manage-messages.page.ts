import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonIcon,
  IonButton,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, mailOpenOutline, trashOutline, callOutline, alertCircleOutline, chatbubblesOutline } from 'ionicons/icons';
import { ApiService, apiErrorMessage } from '../../services/api.service';

addIcons({
  'mail-outline': mailOutline,
  'mail-open-outline': mailOpenOutline,
  'trash-outline': trashOutline,
  'call-outline': callOutline,
  'alert-circle-outline': alertCircleOutline,
  'chatbubbles-outline': chatbubblesOutline,
});

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/** Admin inbox for messages sent from the Contact Us page. */
@Component({
  selector: 'app-manage-messages',
  standalone: true,
  templateUrl: './manage-messages.page.html',
  styleUrls: ['./manage-messages.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class ManageMessagesPage {
  private api = inject(ApiService);
  private alertCtrl = inject(AlertController);

  readonly messages = signal<ContactMessage[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const { messages } = await this.api.get<{ messages: ContactMessage[] }>('/admin/messages');
      this.messages.set(messages);
      this.error.set(null);
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.loaded.set(true);
    }
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async markRead(msg: ContactMessage): Promise<void> {
    if (msg.isRead) return;
    try {
      await this.api.patch(`/admin/messages/${msg.id}/read`, {});
      this.messages.update((list) => list.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)));
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    }
  }

  async confirmDelete(msg: ContactMessage): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete message?',
      message: `From ${msg.name}. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.api.delete(`/admin/messages/${msg.id}`);
              this.messages.update((list) => list.filter((m) => m.id !== msg.id));
            } catch (err) {
              this.error.set(apiErrorMessage(err));
            }
          },
        },
      ],
    });
    await alert.present();
  }

  mailto(msg: ContactMessage): string {
    return `mailto:${msg.email}?subject=${encodeURIComponent(`Re: ${msg.subject || 'Your TeaRush message'}`)}`;
  }
}
