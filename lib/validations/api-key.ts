import { z } from 'zod';

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
  permissions: z.enum(['read', 'read_write']).default('read_write'),
  expires_at: z.string().datetime().nullable().optional(),
});

export type ApiKeyCreateValues = z.infer<typeof apiKeyCreateSchema>;
