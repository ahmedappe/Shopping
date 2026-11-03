import { z } from "zod";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

export const signUpSchema = z.object({
  fullName: trimmed(2, 120, "Name"),
  phone: z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, "Enter a valid phone number"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long")
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(72),
});

export const checkoutSchema = z.object({
  customerName: trimmed(2, 120, "Name"),
  phone: z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, "Enter a valid phone number"),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(200)]),
  address: trimmed(5, 500, "Address"),
  city: trimmed(2, 100, "Island / City"),
  notes: z.string().trim().max(1000).optional().default(""),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "Your cart is empty")
    .max(50),
});

const money = z.coerce.number().min(0, "Must be 0 or more").max(10_000_000);

export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  option1: z.string().trim().max(60).optional().default(""),
  option2: z.string().trim().max(60).optional().default(""),
  sku: z.string().trim().max(64).optional().default(""),
  price: money,
  stock: z.coerce.number().int().min(0).max(1_000_000),
  isActive: z.boolean().default(true),
});

export const productSchema = z
  .object({
    name: trimmed(1, 160, "Name"),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and dashes")
      .max(80),
    description: z.string().trim().max(5000).optional().default(""),
    categoryId: z.union([z.literal(""), z.string().uuid()]),
    compareAtPrice: z.union([z.literal(""), money]).optional(),
    option1Name: z.string().trim().max(40).optional().default(""),
    option2Name: z.string().trim().max(40).optional().default(""),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    variants: z.array(variantSchema).min(1, "Add at least one variant").max(100),
  })
  .superRefine((p, ctx) => {
    if (p.option2Name && !p.option1Name) {
      ctx.addIssue({ code: "custom", message: "Set option 1 before option 2", path: ["option1Name"] });
    }
    const seen = new Set<string>();
    p.variants.forEach((v, i) => {
      if (p.option1Name && !v.option1) {
        ctx.addIssue({ code: "custom", message: `Variant ${i + 1}: ${p.option1Name} is required`, path: ["variants"] });
      }
      if (p.option2Name && !v.option2) {
        ctx.addIssue({ code: "custom", message: `Variant ${i + 1}: ${p.option2Name} is required`, path: ["variants"] });
      }
      const key = `${v.option1.toLowerCase()}|${v.option2.toLowerCase()}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: `Variant ${i + 1} duplicates another variant`, path: ["variants"] });
      }
      seen.add(key);
    });
    if (!p.option1Name && p.variants.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Add an option name (e.g. Size) to have more than one variant",
        path: ["option1Name"],
      });
    }
  });

export const categorySchema = z.object({
  name: trimmed(1, 80, "Name"),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and dashes")
    .max(80),
  description: z.string().trim().max(500).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}

export const ROLE_VALUES = ["customer", "staff", "manager", "admin"] as const;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const createUserSchema = z.object({
  fullName: trimmed(2, 120, "Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, "Enter a valid phone number")]),
  password: passwordSchema,
  role: z.enum(ROLE_VALUES),
});

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  fullName: trimmed(2, 120, "Name"),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, "Enter a valid phone number")]),
  role: z.enum(ROLE_VALUES),
});

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: passwordSchema,
});
