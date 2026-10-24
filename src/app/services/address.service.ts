import { Injectable, computed, inject, signal } from '@angular/core';
import { Address, AddressInput } from '../models/user.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AddressService {
  private api = inject(ApiService);

  private readonly _addresses = signal<Address[]>([]);
  readonly addresses = this._addresses.asReadonly();
  readonly loaded = signal(false);
  readonly defaultAddress = computed(() => this._addresses().find((a) => a.isDefault) ?? this._addresses()[0] ?? null);

  async load(): Promise<Address[]> {
    const { addresses } = await this.api.get<{ addresses: Address[] }>('/addresses');
    this._addresses.set(addresses);
    this.loaded.set(true);
    return addresses;
  }

  async add(input: AddressInput): Promise<Address> {
    const { address } = await this.api.post<{ address: Address }>('/addresses', input);
    await this.load();
    return address;
  }

  async update(id: number, input: AddressInput): Promise<Address> {
    const { address } = await this.api.put<{ address: Address }>(`/addresses/${id}`, input);
    await this.load();
    return address;
  }

  async remove(id: number): Promise<void> {
    await this.api.delete(`/addresses/${id}`);
    await this.load();
  }

  reset(): void {
    this._addresses.set([]);
    this.loaded.set(false);
  }
}
