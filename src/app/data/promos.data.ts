/**
 * Promo rules used by the on-device database — keep in sync with
 * server/src/seed-data.js (the server is the source of truth when connected).
 */
export interface PromoRule {
  code: string;
  title: string;
  description: string;
  kind: 'percent' | 'free_delivery' | 'bogo';
  percent?: number;
  minSubtotal?: number;
  productId?: string;
  firstOrderOnly?: boolean;
  weekday?: number; // 0 = Sunday … 6 = Saturday (Philippine time)
  validUntil?: string; // YYYY-MM-DD, inclusive
  accent: 'brown' | 'caramel' | 'leaf';
}

export const PROMO_RULES: PromoRule[] = [
  {
    code: 'TEARUSH20',
    title: '20% off your first order',
    description: 'New to TeaRush? Get 20% off on your very first purchase, any size.',
    kind: 'percent',
    percent: 20,
    firstOrderOnly: true,
    validUntil: '2026-12-31',
    accent: 'brown',
  },
  {
    code: 'FREESHIP',
    title: 'Free delivery, minimum ₱250',
    description: 'Enjoy free delivery on orders worth ₱250 or more, all day, every day.',
    kind: 'free_delivery',
    minSubtotal: 250,
    validUntil: '2026-12-31',
    accent: 'leaf',
  },
  {
    code: 'BOGO-BROWNSUGAR',
    title: 'Buy 1, take 1 Brown Sugar Milk Tea',
    description: 'Every Friday, buy one Brown Sugar Milk Tea and get a second one free.',
    kind: 'bogo',
    productId: 'brown-sugar-milk-tea',
    weekday: 5,
    validUntil: '2026-12-31',
    accent: 'caramel',
  },
];
