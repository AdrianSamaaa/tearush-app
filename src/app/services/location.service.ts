import { Injectable } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Philippine address data.
 *  - Regions, cities/municipalities and barangays come from the free PSGC API
 *    (https://psgc.gitlab.io/api — the Philippine Standard Geographic Code).
 *  - "Use my current location" uses the phone's GPS + OpenStreetMap Nominatim
 *    reverse geocoding to fill in the street, barangay, city and postal code.
 */
export interface Place {
  code: string;
  name: string;
  /** Extra line shown in pickers, e.g. the province of a city. */
  sub?: string;
  provinceCode?: string | false;
  regionCode?: string;
}

export interface DetectedAddress {
  line1: string;
  barangay: string;
  city: string;
  province: string;
  region: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

const PSGC = 'https://psgc.gitlab.io/api';
const NCR_CODE = '130000000';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private cache = new Map<string, Promise<unknown>>();

  private getJson<T>(url: string): Promise<T> {
    if (!this.cache.has(url)) {
      const request = (async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      })();
      // Don't cache failures, so "try again" works.
      request.catch(() => this.cache.delete(url));
      this.cache.set(url, request);
    }
    return this.cache.get(url) as Promise<T>;
  }

  async regions(): Promise<Place[]> {
    const rows = await this.getJson<{ code: string; name: string; regionName: string }[]>(`${PSGC}/regions/`);
    return rows
      .map((r) => ({ code: r.code, name: r.name, sub: r.regionName }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  private async provinceNames(): Promise<Map<string, string>> {
    const rows = await this.getJson<{ code: string; name: string }[]>(`${PSGC}/provinces/`);
    return new Map(rows.map((p) => [p.code, p.name]));
  }

  async citiesOf(regionCode: string): Promise<Place[]> {
    const [rows, provinces] = await Promise.all([
      this.getJson<{ code: string; name: string; provinceCode: string | false; isCity: boolean }[]>(
        `${PSGC}/regions/${regionCode}/cities-municipalities/`
      ),
      this.provinceNames(),
    ]);
    return rows
      .map((c) => ({
        code: c.code,
        name: c.name,
        provinceCode: c.provinceCode,
        regionCode,
        sub: [c.provinceCode ? provinces.get(c.provinceCode) : regionCode === NCR_CODE ? 'Metro Manila' : '', c.isCity ? 'City' : 'Municipality']
          .filter(Boolean)
          .join(' · '),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async barangaysOf(cityCode: string): Promise<Place[]> {
    const rows = await this.getJson<{ code: string; name: string }[]>(`${PSGC}/cities-municipalities/${cityCode}/barangays/`);
    return rows.map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  /** Province to store for a picked city (NCR cities have no province → "Metro Manila"). */
  async provinceFor(city: Place): Promise<string> {
    if (city.provinceCode) return (await this.provinceNames()).get(city.provinceCode) ?? '';
    return city.regionCode === NCR_CODE ? 'Metro Manila' : '';
  }

  /** Reads the GPS position and turns it into an address. */
  async detectAddress(): Promise<DetectedAddress> {
    if (Capacitor.isNativePlatform()) {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        throw new Error('Location permission was denied. Allow it in Android Settings → Apps → TeaRush, or type the address.');
      }
    }
    let position;
    try {
      position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 });
    } catch {
      throw new Error("Couldn't get your location. Turn on location services and try again.");
    }
    const { latitude, longitude } = position.coords;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`;
    let data: { address?: Record<string, string> };
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({
          url,
          headers: { 'User-Agent': 'TeaRush/1.0 (com.tearush.app)', 'Accept-Language': 'en' },
          connectTimeout: 15_000,
          readTimeout: 15_000,
        });
        data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      } else {
        data = await (await fetch(url, { headers: { 'Accept-Language': 'en' } })).json();
      }
    } catch {
      throw new Error("Found your location but couldn't look up the address. Please type it instead.");
    }
    const a = data.address ?? {};
    return {
      line1: [a['house_number'], a['road']].filter(Boolean).join(' ') || a['neighbourhood'] || '',
      barangay: a['quarter'] || a['suburb'] || a['village'] || a['neighbourhood'] || a['hamlet'] || '',
      city: a['city'] || a['town'] || a['municipality'] || '',
      province: a['state'] || a['province'] || (a['region'] === 'Metro Manila' ? 'Metro Manila' : ''),
      region: a['region'] || '',
      postalCode: a['postcode'] || '',
      latitude,
      longitude,
    };
  }
}
