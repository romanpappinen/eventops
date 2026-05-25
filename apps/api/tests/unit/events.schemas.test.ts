import { describe, expect, it } from 'vitest';
import {
    createEventDtoSchema,
    eventParamsDtoSchema,
    tenantEventParamsDtoSchema,
} from '@eventops/validation';

describe('event DTO schemas', () => {
    it('accepts a valid create event DTO and defaults metadata', () => {
        const result = createEventDtoSchema.parse({
            source: 'web-app',
            type: 'order_created',
            subject: 'order:123',
            occurredAt: '2026-05-18T12:00:00.000Z',
            payload: {
                orderId: '123',
                amount: 49,
            },
        });

        expect(result).toEqual({
            source: 'web-app',
            type: 'order_created',
            subject: 'order:123',
            occurredAt: '2026-05-18T12:00:00.000Z',
            payload: {
                orderId: '123',
                amount: 49,
            },
            metadata: {},
        });
    });

    it('rejects invalid event payload shapes', () => {
        const result = createEventDtoSchema.safeParse({
            source: 'w',
            type: 'Order Created',
            occurredAt: 'not-a-date',
            payload: [],
        });

        expect(result.success).toBe(false);
    });

    it('validates tenant-scoped params DTOs', () => {
        expect(
            tenantEventParamsDtoSchema.parse({
                tenantId: '550e8400-e29b-41d4-a716-446655440000',
            })
        ).toEqual({
            tenantId: '550e8400-e29b-41d4-a716-446655440000',
        });

        expect(
            eventParamsDtoSchema.parse({
                tenantId: '550e8400-e29b-41d4-a716-446655440000',
                eventId: '550e8400-e29b-41d4-a716-446655440001',
            })
        ).toEqual({
            tenantId: '550e8400-e29b-41d4-a716-446655440000',
            eventId: '550e8400-e29b-41d4-a716-446655440001',
        });
    });
});
