import { z } from 'zod';

export const businessInfoSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  address: z.string().min(5, 'Enter the cafe address'),
  phone: z.string().min(7, 'Enter a valid contact number'),
  email: z.string().email('Enter a valid business email'),
  tin: z.string().optional(),
  receiptFooter: z.string().min(2, 'Enter a receipt thank-you message'),
});

export const branchSchema = z.object({
  code: z.string().min(2).max(10).regex(/^[A-Z0-9]+$/, 'Uppercase letters/numbers only'),
  name: z.string().min(2, 'Branch name is required'),
  address: z.string().min(5, 'Branch address is required'),
  phone: z.string().min(7, 'Branch phone is required'),
  orderPrefix: z.string().min(2).max(6).regex(/^[A-Z0-9]+$/, 'Uppercase prefix only'),
});

export const taxProfileSchema = z.object({
  name: z.string().min(2, 'Tax profile name is required'),
  taxType: z.enum(['vat', 'non_vat']),
  pricingMode: z.enum(['inclusive', 'exclusive']),
  ratePercent: z.coerce.number().min(0).max(50),
  isExempt: z.boolean(),
});

export const productSchema = z.object({
  name: z.string().min(2, 'Product name is required'),
  sku: z.string().min(2, 'SKU is required'),
  barcode: z.string().optional(),
  categoryId: z.string().min(1, 'Category is required'),
  kdsStationId: z.string().min(1, 'Preparation station is required'),
  description: z.string().min(2, 'Short description is required'),
  basePrice: z.coerce.number().min(0, 'Price must be 0 or greater'),
  isFeatured: z.boolean().default(false),
});

export const ingredientSchema = z.object({
  name: z.string().min(2, 'Ingredient name is required'),
  categoryName: z.string().min(2, 'Category is required'),
  barcode: z.string().optional(),
  purchaseUnit: z.string().min(1, 'Purchase unit is required'),
  recipeUnit: z.string().min(1, 'Recipe unit is required'),
  conversionRatio: z.coerce.number().positive('Conversion ratio must be greater than 0'),
  currentStock: z.coerce.number().min(0),
  reorderPoint: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0),
});

export const staffInviteSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  roleKey: z.enum(['manager', 'cashier', 'barista', 'rider']),
});

export const paymentSubmissionSchema = z.object({
  method: z.enum(['cash', 'gcash', 'maya', 'card', 'bank_transfer']),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  referenceNumber: z.string().optional(),
}).refine(
  (val) => val.method === 'cash' || (val.referenceNumber && val.referenceNumber.trim().length >= 4),
  {
    message: 'Payment reference number (min 4 chars) is required for digital/card payments',
    path: ['referenceNumber'],
  }
);

export const cashMovementSchema = z.object({
  type: z.enum(['cash_in', 'cash_out']),
  amount: z.coerce.number().positive('Amount must be positive'),
  reason: z.string().min(3, 'Reason is required for audit trail'),
});
