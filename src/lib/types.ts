export type OrderStatus = "pending" | "slip_uploaded" | "approved" | "delivered" | "rejected";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
};

export type ProductListing = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  compare_at_price: number | null;
  min_price: number;
  max_price: number;
  total_stock: number;
  variant_count: number;
  image_path: string | null;
};

export type Variant = {
  id: string;
  product_id: string;
  option1: string | null;
  option2: string | null;
  sku: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  sort_order: number;
};

export type ProductImage = {
  id: string;
  product_id: string;
  path: string;
  width: number | null;
  height: number | null;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  compare_at_price: number | null;
  option1_name: string | null;
  option2_name: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductDetail = Product & {
  category: Pick<Category, "id" | "name" | "slug"> | null;
  product_variants: Variant[];
  product_images: ProductImage[];
};

export type Order = {
  id: string;
  order_number: string;
  user_id: string;
  outlet_id: string | null;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  notes: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  slip_path: string | null;
  slip_uploaded_at: string | null;
  slip_bank: string | null;
  slip_reference: string | null;
  slip_amount: number | null;
  slip_paid_at: string | null;
  slip_verdict: "ok" | "review" | "unchecked" | null;
  slip_checks: { checks?: Record<string, boolean | null>; warnings?: string[] } | null;
  admin_note: string | null;
  handover_method: "delivery" | "collection" | null;
  collection_location: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  sku: string | null;
  image_path: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type OrderHistory = {
  id: number;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  created_at: string;
};

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type Outlet = {
  id: string;
  name: string;
  slug: string;
  /** Domains that open this outlet's store, e.g. shop.northjugo.mv */
  hostnames: string[];
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  /** null = use the store-wide delivery setting */
  delivery_fee: number | null;
  free_delivery_threshold: number | null;
  is_active: boolean;
  sort_order: number;
};
