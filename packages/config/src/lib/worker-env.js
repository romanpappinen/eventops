"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWorkerEnv = parseWorkerEnv;
var zod_1 = require("zod");
var workerEnvSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    REDIS_URL: zod_1.z.string().min(1),
    SUPABASE_URL: zod_1.z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().min(1),
    RESEND_API_KEY: zod_1.z.string().min(1),
    INVITATION_FROM_EMAIL: zod_1.z.string().email(),
    APP_WEB_BASE_URL: zod_1.z.string().url(),
    INVITATION_EMAIL_BATCH_SIZE: zod_1.z.coerce.number().int().min(1).default(10),
    INVITATION_EMAIL_POLL_INTERVAL_MS: zod_1.z.coerce.number().int().min(1000).default(5000),
    INVITATION_EMAIL_MAX_ATTEMPTS: zod_1.z.coerce.number().int().min(1).default(5)
});
function parseWorkerEnv(env) {
    return workerEnvSchema.parse(env);
}
