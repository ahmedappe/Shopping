"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CartItem = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string;
  price: number;
  imagePath: string | null;
  quantity: number;
  maxStock: number;
};

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  /** Replace price/stock with fresh values from the server. */
  sync: (updates: Record<string, { price: number; stock: number; available: boolean }>) => void;
};

const clampQty = (qty: number, max: number) => Math.max(1, Math.min(qty, Math.max(1, Math.min(max, 99))));

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.variantId === item.variantId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.variantId === item.variantId
                  ? { ...i, ...item, quantity: clampQty(i.quantity + quantity, item.maxStock) }
                  : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: clampQty(quantity, item.maxStock) }].slice(0, 50) };
        }),
      setQuantity: (variantId, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.variantId === variantId ? { ...i, quantity: clampQty(quantity, i.maxStock) } : i,
          ),
        })),
      remove: (variantId) => set((state) => ({ items: state.items.filter((i) => i.variantId !== variantId) })),
      clear: () => set({ items: [] }),
      sync: (updates) =>
        set((state) => ({
          items: state.items
            .filter((i) => updates[i.variantId]?.available)
            .map((i) => {
              const u = updates[i.variantId]!;
              return { ...i, price: u.price, maxStock: u.stock, quantity: Math.min(i.quantity, Math.max(u.stock, 0)) };
            })
            .filter((i) => i.quantity > 0),
        })),
    }),
    {
      name: "cart-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.quantity, 0);
export const cartSubtotal = (items: CartItem[]) => items.reduce((n, i) => n + i.price * i.quantity, 0);
