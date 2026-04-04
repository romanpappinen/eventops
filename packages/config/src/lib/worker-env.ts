import { z } from 'zod';

const workerEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    REDIS_URL: z.string().min(1),
    SUPABASE_URL: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(env: Record<string, string | undefined>): WorkerEnv {
    return workerEnvSchema.parse(env);
}
