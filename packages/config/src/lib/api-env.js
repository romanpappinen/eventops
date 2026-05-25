"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseApiEnv = parseApiEnv;
var zod_1 = require("zod");
var apiEnvSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: zod_1.z.coerce.number().default(3000),
    SUPABASE_URL: zod_1.z.string().min(1),
    SUPABASE_ANON_KEY: zod_1.z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().min(1),
    REDIS_URL: zod_1.z.string().min(1)
});
function parseApiEnv(env) {
    return apiEnvSchema.parse(env);
}
