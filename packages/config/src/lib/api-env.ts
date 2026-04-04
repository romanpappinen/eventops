import { z } from 'zod';

const apiEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().default(3000),
    SUPABASE_URL: z.string().min(1),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    REDIS_URL: z.string().min(1)
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(env: Record<string, string | undefined>): ApiEnv {
    return apiEnvSchema.parse(env);
}
