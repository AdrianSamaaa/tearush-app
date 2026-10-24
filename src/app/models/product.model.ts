export type ProductCategory =
  | 'Milk Tea Classics'
  | 'Fruit Tea'
  | 'Cheese Foam'
  | 'Signature';

export interface ProductTopping {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;          // base price, medium size
  description: string;
  image: string;          // path under assets/products (placeholder-friendly)
  popular?: boolean;
  rating?: number;        // 0–5
  available?: boolean;    // false = hidden from the menu (admins still see it)
}

export const TOPPINGS: ProductTopping[] = [
  { id: 'pearls', name: 'Brown Sugar Pearls', price: 20 },
  { id: 'pudding', name: 'Egg Pudding', price: 20 },
  { id: 'nata', name: 'Nata de Coco', price: 15 },
  { id: 'cheese', name: 'Cheese Foam', price: 30 },
  { id: 'grass-jelly', name: 'Grass Jelly', price: 15 },
];

export const SIZES = ['Small', 'Medium', 'Large'] as const;
export type ProductSize = typeof SIZES[number];

export const SIZE_SURCHARGE: Record<ProductSize, number> = {
  Small: -10,
  Medium: 0,
  Large: 15,
};

export const SUGAR_LEVELS = ['0%', '25%', '50%', '75%', '100%'] as const;
export const ICE_LEVELS = ['No Ice', 'Less Ice', 'Normal Ice', 'Extra Ice'] as const;

/** "Customize My Drink" — must match CUSTOM_DRINK in server/src/pricing.js. */
export const CUSTOM_DRINK = {
  id: 'custom-drink',
  basePrice: 89,
  image: 'assets/products/custom-drink.jpg',
  teaBases: ['Black Tea', 'Green Tea', 'Oolong Tea', 'Jasmine Tea'],
  milks: ['Fresh Milk', 'Oat Milk', 'Condensed Milk', 'None'],
} as const;

export const DELIVERY_FEE = 49;

