import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { cleanupLiveTestData, registerAndSignIn, uniqueSlug } from './support/live-client.js';

describe('event ingestion via API key against a real local Supabase stack', () => {
    const app = createApp();
    const tenantIds: string[] = [];
    const userIds: string[] = [];

    afterAll(async () => {
        await cleanupLiveTestData({ tenantIds, userIds });
    });

    async function createOwnerWithTenantAndKey(slugPrefix: string) {
        const owner = await registerAndSignIn(app, { emailPrefix: `${slugPrefix}-owner` });
        userIds.push(owner.id);
        const tenantResponse = await request(app)
            .post('/tenants')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Ingest Live', slug: uniqueSlug(slugPrefix) });
        const tenantId = tenantResponse.body.item.id as string;
        tenantIds.push(tenantId);

        const keyResponse = await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Live ingest key' });
        const apiKeyId = keyResponse.body.item.id as string;
        const rawKey = keyResponse.body.item.rawKey as string;

        return { owner, tenantId, apiKeyId, rawKey };
    }

    it('accepts a real event with zero Supabase session, attributed to the key', async () => {
        const { tenantId, apiKeyId, rawKey } = await createOwnerWithTenantAndKey('ingest-crud');

        // No Authorization header pointing at any Supabase user -- only the
        // raw API key, simulating a genuine external backend integration.
        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send({
                source: 'external-backend',
                type: 'order.created',
                occurredAt: new Date().toISOString(),
                payload: { orderId: 'live-ingest-1' },
            });

        expect(response.status).toBe(201);
        expect(response.body.item).toMatchObject({
            tenantId,
            createdByApiKeyId: apiKeyId,
            createdByUserId: null,
        });
    });

    it('returns 401 for a garbage key', async () => {
        const response = await request(app)
            .post('/events')
            .set('Authorization', 'Bearer eo_live_this-key-does-not-exist')
            .send({
                source: 'external-backend',
                type: 'order.created',
                occurredAt: new Date().toISOString(),
                payload: {},
            });

        expect(response.status).toBe(401);
    });

    it('returns 401 once the key has been revoked', async () => {
        const { owner, tenantId, apiKeyId, rawKey } = await createOwnerWithTenantAndKey('ingest-revoke');

        const revokeResponse = await request(app)
            .delete(`/tenants/${tenantId}/api-keys/${apiKeyId}`)
            .set('Authorization', `Bearer ${owner.accessToken}`);
        expect(revokeResponse.status).toBe(200);

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send({
                source: 'external-backend',
                type: 'order.created',
                occurredAt: new Date().toISOString(),
                payload: {},
            });

        expect(response.status).toBe(401);
    });
});
