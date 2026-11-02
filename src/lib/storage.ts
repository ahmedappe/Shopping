export const PRODUCT_BUCKET = "product-images";
export const SLIP_BUCKET = "payment-slips";

/** Public URL for a product image path stored in the product-images bucket. */
export function productImageUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_BUCKET}/${path}`;
}
