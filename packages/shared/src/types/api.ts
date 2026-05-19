export interface ApiHealthResponse {
    status: 'ok';
    service: string;
}

export type EventStatus = 'accepted' | 'processed' | 'failed' | 'archived';

export interface EventItem {
    id: string;
    tenantId: string;
    source: string;
    type: string;
    subject: string | null;
    occurredAt: string;
    receivedAt: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    status: EventStatus;
    createdByUserId: string | null;
    idempotencyKey: string | null;
    createdAt: string;
    updatedAt: string;
}
