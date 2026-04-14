import { z } from 'zod';

export const createTenantSchema = z.object({
    name: z.string().min(2).max(100),
    slug: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-z0-9-]+$/),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
