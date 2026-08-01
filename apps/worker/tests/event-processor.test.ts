import { afterEach, describe, expect, it, vi } from 'vitest';

const { markEventProcessed, markEventFailed } = vi.hoisted(() => ({
    markEventProcessed: vi.fn().mockResolvedValue(undefined),
    markEventFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/supabase-rest.js', () => ({
    markEventProcessed,
    markEventFailed,
    listAcceptedEvents: vi.fn().mockResolvedValue([]),
}));

import { processEvent } from '../src/event-processor.js';

afterEach(() => {
    vi.clearAllMocks();
    delete process.env.EVENT_MAX_PAYLOAD_BYTES;
});

describe('processEvent', () => {
    it('marks a small event processed', async () => {
        await processEvent({
            id: 'event-1',
            payload: { orderId: '123' },
            metadata: {},
        });

        expect(markEventProcessed).toHaveBeenCalledWith('event-1');
        expect(markEventFailed).not.toHaveBeenCalled();
    });

    it('marks an oversized event failed with a specific reason', async () => {
        process.env.EVENT_MAX_PAYLOAD_BYTES = '10';

        await processEvent({
            id: 'event-2',
            payload: { orderId: 'this payload is much longer than the configured limit' },
            metadata: {},
        });

        expect(markEventFailed).toHaveBeenCalledWith(
            'event-2',
            expect.stringContaining('exceed the maximum allowed size')
        );
        expect(markEventProcessed).not.toHaveBeenCalled();
    });
});
