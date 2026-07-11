import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { cleanupLiveTestData, registerAndSignIn, uniqueSlug } from './support/live-client.js';

describe('events against a real local Supabase stack', () => {
    const app = createApp();
    const tenantIds: string[] = [];
    const userIds: string[] = [];

    afterAll(async () => {
        await cleanupLiveTestData({ tenantIds, userIds });
    });

    async function createOwnerWithTenant(slugPrefix: string) {
        const owner = await registerAndSignIn(app, { emailPrefix: `${slugPrefix}-owner` });
        userIds.push(owner.id);
        const createResponse = await request(app)
            .post('/tenants')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Events Live', slug: uniqueSlug(slugPrefix) });
        const tenantId = createResponse.body.item.id as string;
        tenantIds.push(tenantId);
        return { owner, tenantId };
    }

    it('creates, lists, and fetches a single event through RLS-backed routes', async () => {
        const { owner, tenantId } = await createOwnerWithTenant('events-crud');

        const createResponse = await request(app)
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({
                source: 'live-test',
                type: 'order.created',
                subject: 'order:live-1',
                occurredAt: new Date().toISOString(),
                payload: { orderId: 'live-1' },
            });

        expect(createResponse.status).toBe(201);
        expect(createResponse.body.item).toMatchObject({
            tenantId,
            source: 'live-test',
            type: 'order.created',
            subject: 'order:live-1',
            payload: { orderId: 'live-1' },
        });
        const eventId = createResponse.body.item.id as string;

        const listResponse = await request(app)
            .get(`/tenants/${tenantId}/events`)
            .set('Authorization', `Bearer ${owner.accessToken}`);
        expect(listResponse.status).toBe(200);
        expect(listResponse.body.items).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: eventId })])
        );

        const getResponse = await request(app)
            .get(`/tenants/${tenantId}/events/${eventId}`)
            .set('Authorization', `Bearer ${owner.accessToken}`);
        expect(getResponse.status).toBe(200);
        expect(getResponse.body.item).toMatchObject({ id: eventId, tenantId, source: 'live-test' });
    });

    it('returns 404 for an event id that does not exist in the tenant', async () => {
        const { owner, tenantId } = await createOwnerWithTenant('events-404');

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/00000000-0000-0000-0000-000000000000`)
            .set('Authorization', `Bearer ${owner.accessToken}`);

        expect(response.status).toBe(404);
    });

    it('replays the same event on a repeated idempotency key instead of creating a duplicate', async () => {
        const { owner, tenantId } = await createOwnerWithTenant('events-idempotency');
        const idempotencyKey = `live-idem-${Date.now()}`;

        const first = await request(app)
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({
                source: 'live-test',
                type: 'order.created',
                occurredAt: new Date().toISOString(),
                payload: { orderId: 'first-attempt' },
                idempotencyKey,
            });
        expect(first.status).toBe(201);
        const eventId = first.body.item.id as string;

        const retry = await request(app)
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({
                source: 'live-test',
                type: 'order.created',
                occurredAt: new Date().toISOString(),
                payload: { orderId: 'retried-attempt' },
                idempotencyKey,
            });
        expect(retry.status).toBe(200);
        expect(retry.body.item.id).toBe(eventId);
        expect(retry.body.item.payload).toEqual({ orderId: 'first-attempt' });

        const listResponse = await request(app)
            .get(`/tenants/${tenantId}/events`)
            .set('Authorization', `Bearer ${owner.accessToken}`);
        expect(listResponse.body.items.filter((item: { id: string }) => item.id === eventId)).toHaveLength(1);
    });

    it('does not let a non-member create, list, or read events for someone else tenant (RLS boundary)', async () => {
        const { tenantId } = await createOwnerWithTenant('events-rls');
        const outsider = await registerAndSignIn(app, { emailPrefix: 'events-outsider' });
        userIds.push(outsider.id);

        const createAsOutsider = await request(app)
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', `Bearer ${outsider.accessToken}`)
            .send({
                source: 'live-test',
                type: 'order.created',
                occurredAt: new Date().toISOString(),
                payload: {},
            });
        expect(createAsOutsider.status).toBe(404);

        const listAsOutsider = await request(app)
            .get(`/tenants/${tenantId}/events`)
            .set('Authorization', `Bearer ${outsider.accessToken}`);
        expect(listAsOutsider.status).toBe(404);
    });
});
