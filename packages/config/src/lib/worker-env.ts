import { z } from 'zod';

const workerEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    REDIS_URL: z.string().min(1),
    SUPABASE_URL: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    INVITATION_FROM_EMAIL: z.string().email(),
    APP_WEB_BASE_URL: z.string().url(),
    INVITATION_EMAIL_BATCH_SIZE: z.coerce.number().int().min(1).default(10),
    INVITATION_EMAIL_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
    INVITATION_EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5)
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(env: Record<string, string | undefined>): WorkerEnv {
    return workerEnvSchema.parse(env);
}
