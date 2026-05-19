import type { EventItem, EventStatus } from '@eventops/shared';

export interface EventRow {
    id: string;
    tenant_id: string;
    source: string;
    type: string;
    subject?: string | null;
    occurred_at: string;
    received_at?: string | null;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    status: EventStatus;
    created_by_user_id?: string | null;
    idempotency_key?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export function normalizeEventRecord(record: EventRow): EventItem {
    return {
        id: record.id,
        tenantId: record.tenant_id,
        source: record.source,
        type: record.type,
        subject: record.subject ?? null,
        occurredAt: record.occurred_at,
        receivedAt: record.received_at ?? '',
        payload: record.payload,
        metadata: record.metadata ?? {},
        status: record.status,
        createdByUserId: record.created_by_user_id ?? null,
        idempotencyKey: record.idempotency_key ?? null,
        createdAt: record.created_at ?? '',
        updatedAt: record.updated_at ?? '',
    };
}
