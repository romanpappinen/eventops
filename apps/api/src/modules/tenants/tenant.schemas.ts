import { z } from 'zod';

export const createTenantSchema = z.object({
    name: z.string().trim().min(2).max(100),
    description: z
        .string()
        .trim()
        .max(500)
        .optional()
        .transform((value) => (value && value.length > 0 ? value : undefined)),
    slug: z
        .string()
        .trim()
        .min(2)
        .max(50)
        .regex(/^[a-z0-9-]+$/)
        .optional(),
}).strict();

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z
        .string()
        .trim()
        .max(500)
        .nullable()
        .optional()
        .transform((value) => {
            if (value === null) {
                return null;
            }

            return value && value.length > 0 ? value : undefined;
        }),
    slug: z
        .string()
        .trim()
        .min(2)
        .max(50)
        .regex(/^[a-z0-9-]+$/)
        .optional(),
}).strict().refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
        message: 'At least one field must be provided',
    }
);

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const tenantParamsSchema = z.object({
    tenantId: z.string().uuid(),
});

export type TenantParams = z.infer<typeof tenantParamsSchema>;

export const inviteTenantMemberSchema = z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    role: z.enum(['admin', 'member']).default('member'),
}).strict();

export type InviteTenantMemberInput = z.infer<typeof inviteTenantMemberSchema>;
