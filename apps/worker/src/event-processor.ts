import { createLogger } from '@eventops/logger';
import { parseWorkerEnv } from '@eventops/config';
import { listAcceptedEvents, markEventFailed, markEventProcessed } from './lib/supabase-rest.js';

const logger = createLogger('worker:event-processor');

export interface AcceptedEventRow {
    id: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * There are no downstream integrations in this project to deliver events
 * to, so "processing" is structural validation: reject events whose
 * payload+metadata are implausibly large. The size is measured on the
 * PostgREST-normalized JSON (whitespace stripped, keys/numbers possibly
 * renormalized), not the original request bytes -- close enough for a
 * structural size guard, not meant to be byte-exact with what the client
 * sent.
 */
export async function processEvent(event: AcceptedEventRow) {
    const env = parseWorkerEnv(process.env);
    const size = JSON.stringify(event.payload).length + JSON.stringify(event.metadata).length;

    if (size > env.EVENT_MAX_PAYLOAD_BYTES) {
        await markEventFailed(
            event.id,
            `Payload and metadata combined exceed the maximum allowed size (${env.EVENT_MAX_PAYLOAD_BYTES} bytes)`
        );
        return;
    }

    await markEventProcessed(event.id);
}

export async function runEventProcessor() {
    const env = parseWorkerEnv(process.env);

    logger.info('Event processor started');

    while (true) {
        try {
            const events = await listAcceptedEvents(env.EVENT_PROCESSING_BATCH_SIZE);

            for (const event of events) {
                try {
                    await processEvent(event);
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Event processing failed';
                    logger.warn({ eventId: event.id, err: error }, message);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Event processing polling failed';
            logger.error({ err: error }, message);
        }

        await sleep(env.EVENT_PROCESSING_POLL_INTERVAL_MS);
    }
}
