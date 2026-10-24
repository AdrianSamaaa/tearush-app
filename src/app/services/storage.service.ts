import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Key/value storage backed by Capacitor Preferences (Android SharedPreferences
 * on device, localStorage in the browser). Unlike WebView localStorage, this
 * isn't wiped when Android clears the WebView cache.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const { value } = await Preferences.get({ key });
      return value === null ? null : (JSON.parse(value) as T);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      await Preferences.set({ key, value: JSON.stringify(value) });
    } catch {
      /* storage unavailable — the app still works for this session */
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await Preferences.remove({ key });
    } catch {
      /* ignore */
    }
  }
}
