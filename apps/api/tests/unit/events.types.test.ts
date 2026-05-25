import { describe, expect, it } from 'vitest';
import { normalizeEventRecord } from '../../src/modules/events/events.types.js';

describe('normalizeEventRecord', () => {
    it('maps database rows to the shared API event shape', () => {
        const item = normalizeEventRecord({
            id: 'event-123',
            tenant_id: 'tenant-123',
            source: 'web-app',
            type: 'order_created',
            subject: 'order:123',
            occurred_at: '2026-05-18T12:00:00.000Z',
            received_at: '2026-05-18T12:00:01.000Z',
            payload: {
                orderId: '123',
                amount: 49,
            },
            metadata: {
                schemaVersion: 1,
            },
            status: 'accepted',
            created_by_user_id: 'user-123',
            idempotency_key: null,
            created_at: '2026-05-18T12:00:01.000Z',
            updated_at: '2026-05-18T12:00:01.000Z',
        });

        expect(item).toEqual({
            id: 'event-123',
            tenantId: 'tenant-123',
            source: 'web-app',
            type: 'order_created',
            subject: 'order:123',
            occurredAt: '2026-05-18T12:00:00.000Z',
            receivedAt: '2026-05-18T12:00:01.000Z',
            payload: {
                orderId: '123',
                amount: 49,
            },
            metadata: {
                schemaVersion: 1,
            },
            status: 'accepted',
            createdByUserId: 'user-123',
            idempotencyKey: null,
            createdAt: '2026-05-18T12:00:01.000Z',
            updatedAt: '2026-05-18T12:00:01.000Z',
        });
    });
});
