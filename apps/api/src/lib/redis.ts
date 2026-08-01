import Redis from 'ioredis';
import { parseApiEnv } from '@eventops/config';
import { createLogger } from '@eventops/logger';

const logger = createLogger('api:redis');

let client: Redis | null = null;

/**
 * A single long-lived connection, unlike the Supabase helpers in this
 * directory which create a lightweight client per call -- ioredis holds an
 * actual TCP socket, so it's worth keeping one around instead of
 * reconnecting on every request.
 */
export function getRedisClient() {
    if (!client) {
        const env = parseApiEnv(process.env);
        client = new Redis(env.REDIS_URL);

        // ioredis emits 'error' on connection trouble; an EventEmitter with
        // no 'error' listener throws and crashes the process on the next
        // one. Log and let ioredis's own retry strategy keep trying instead
        // of taking the whole API down over a transient Redis blip.
        client.on('error', (err) => {
            logger.error({ err }, 'Redis connection error');
        });
    }

    return client;
}
