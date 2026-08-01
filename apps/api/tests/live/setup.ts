import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

process.env.NODE_ENV = 'test';
process.env.API_PORT = process.env.API_PORT ?? '3000';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
    throw new Error(
        `Live Supabase tests require ${missing.join(', ')} in the repo-root .env, pointing at a ` +
            'running local Supabase stack. See CHECKLIST.md > "Local Supabase stack".'
    );
}

const healthUrl = `${process.env.SUPABASE_URL}/auth/v1/health`;
const response = await fetch(healthUrl).catch(() => null);

if (!response || !response.ok) {
    throw new Error(
        `Live Supabase tests could not reach ${healthUrl}. Is the local stack running ` +
            '("supabase start" on the host)? See CHECKLIST.md > "Local Supabase stack".'
    );
}
