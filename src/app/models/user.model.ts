export type UserRole = 'customer' | 'admin';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  /** Profile photo as a data URL, or null. */
  avatar?: string | null;
  /** Orders require a verified email address. */
  emailVerified?: boolean;
  createdAt: string;
}

/** Returned when a verification code is (re)sent. */
export interface VerificationInfo {
  sentTo: string;
  /** Only when email sending isn't set up (demo mode) — the app shows the code. */
  devCode?: string;
  /** Email couldn't be sent. */
  error?: string;
}

export interface Address {
  id: number;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  barangay: string;
  city: string;
  province: string;
  region?: string;
  postalCode: string;
  latitude?: number | null;
  longitude?: number | null;
  notes: string;
  isDefault: boolean;
}

export type AddressInput = Omit<Address, 'id'>;

export function formatAddress(a: Pick<Address, 'line1' | 'barangay' | 'city' | 'province' | 'postalCode'> & { region?: string }): string {
  return [a.line1, a.barangay, a.city, a.province || a.region, a.postalCode].filter(Boolean).join(', ');
}
