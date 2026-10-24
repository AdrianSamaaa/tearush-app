export type OrderStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'preparing'
  | 'out_for_delivery'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';

export type Fulfillment = 'delivery' | 'pickup';
export type PaymentMethod = 'cod' | 'gcash' | 'paymaya' | 'card' | 'grab_pay' | 'qrph' | 'shopee_pay' | 'billease' | 'dob';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface OrderItem {
  productId: string;
  name: string;
  image: string;
  size: string;
  sugar: string;
  ice: string;
  toppings: string[];
  toppingIds: string[];
  options: { teaBase?: string; milk?: string };
  unitPrice: number;
  quantity: number;
}

export interface OrderEvent {
  status: OrderStatus;
  label: string;
  note: string;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  paymentStatus: PaymentStatus;
  paidVia: string | null;
  paidAt: string | null;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  promoCode: string | null;
  contactName: string;
  contactPhone: string;
  address: string;
  notes: string;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  canPay: boolean;
  canCancel: boolean;
  items: OrderItem[];
  events: OrderEvent[];
  /** Admin-only fields */
  nextStatuses?: { value: OrderStatus; label: string }[];
  customer?: { id: number; name: string; email: string; phone: string } | null;
}

/** A cart line as the API expects it. Prices are always recomputed by the server. */
export interface OrderLineInput {
  productId: string;
  size: string;
  sugar: string;
  ice: string;
  toppingIds: string[];
  options?: { teaBase?: string; milk?: string };
  quantity: number;
}

export interface Quote {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  promo: { code: string; title: string } | null;
  promoError: string | null;
}

export interface PlaceOrderInput {
  items: OrderLineInput[];
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  promoCode?: string;
  addressId?: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

export interface AdminStats {
  today: { orders: number; revenue: number };
  counts: Partial<Record<OrderStatus, number>>;
  active: number;
}

export const ACTIVE_STATUSES: OrderStatus[] = ['awaiting_payment', 'pending', 'preparing', 'out_for_delivery', 'ready_for_pickup'];

export const STATUS_ICONS: Record<OrderStatus, string> = {
  awaiting_payment: 'card-outline',
  pending: 'receipt-outline',
  preparing: 'time-outline',
  out_for_delivery: 'bicycle-outline',
  ready_for_pickup: 'bag-check-outline',
  completed: 'checkmark-circle',
  cancelled: 'close-circle-outline',
};
