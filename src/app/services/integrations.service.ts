import { Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { PaymentMethod } from '../models/order.model';
import { StorageService } from './storage.service';

/**
 * Settings for running the shop without the TeaRush server (on-device mode):
 *  - PayMongo **test** secret key → GCash / Maya / card / GrabPay checkout straight from the app.
 *  - EmailJS keys → verification codes sent by email (https://www.emailjs.com, free plan).
 * Saved on this phone only (never inside the APK). With the server, these live in the
 * server's environment instead and this page isn't needed.
 */
export interface Integrations {
  paymongoSecretKey: string;
  paymongoMethods: PaymentMethod[];
  emailjsServiceId: string;
  emailjsTemplateId: string;
  emailjsPublicKey: string;
  /** Optional EmailJS private key ("accessToken"). Typed in Shop Settings only — never shipped in the APK. */
  emailjsPrivateKey: string;
}

const KEY = 'tearush_integrations';
export const ONLINE_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'gcash', label: 'GCash' },
  { value: 'paymaya', label: 'Maya' },
  { value: 'card', label: 'Credit/Debit Card' },
  { value: 'grab_pay', label: 'GrabPay' },
];

/** Only test keys may live on a phone; live keys belong on the server. */
export const isTestSecretKey = (key: string) => /^sk_test_[A-Za-z0-9]+$/.test(key.trim());

@Injectable({ providedIn: 'root' })
export class IntegrationsService {
  private storage = inject(StorageService);
  private loading: Promise<void> | null = null;

  readonly settings = signal<Integrations>({
    paymongoSecretKey: '',
    paymongoMethods: ONLINE_METHODS.map((m) => m.value),
    emailjsServiceId: environment.emailjs.serviceId,
    emailjsTemplateId: environment.emailjs.templateId,
    emailjsPublicKey: environment.emailjs.publicKey,
    emailjsPrivateKey: '',
  });

  readonly paymentsEnabled = computed(() => isTestSecretKey(this.settings().paymongoSecretKey));
  readonly emailEnabled = computed(() => {
    const s = this.settings();
    return Boolean(s.emailjsServiceId && s.emailjsTemplateId && s.emailjsPublicKey);
  });

  /** Keys in the shape sendEmailJs() expects. */
  readonly emailJsKeys = computed(() => {
    const s = this.settings();
    return { serviceId: s.emailjsServiceId, templateId: s.emailjsTemplateId, publicKey: s.emailjsPublicKey, privateKey: s.emailjsPrivateKey };
  });

  load(): Promise<void> {
    this.loading ??= (async () => {
      const saved = await this.storage.get<Partial<Integrations>>(KEY);
      if (saved) this.settings.update((current) => ({ ...current, ...saved }));
    })();
    return this.loading;
  }

  async save(changes: Partial<Integrations>): Promise<void> {
    await this.load();
    this.settings.update((current) => ({ ...current, ...changes }));
    await this.storage.set(KEY, this.settings());
  }
}
