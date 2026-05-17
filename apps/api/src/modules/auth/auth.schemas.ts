import { z } from 'zod';

export const registerSchema = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
