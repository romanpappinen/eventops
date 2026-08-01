import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { cleanupLiveTestData, registerAndSignIn, uniqueSlug } from './support/live-client.js';

describe('tenants against a real local Supabase stack', () => {
    const app = createApp();
    const tenantIds: string[] = [];
    const userIds: string[] = [];

    afterAll(async () => {
        await cleanupLiveTestData({ tenantIds, userIds });
    });

    it('creates a tenant via create_tenant_with_owner and lists it back for the owner', async () => {
        const owner = await registerAndSignIn(app, { emailPrefix: 'owner' });
        userIds.push(owner.id);

        const slug = uniqueSlug('acme');
        const createResponse = await request(app)
            .post('/tenants')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Acme Live', slug, description: 'live test tenant' });

        expect(createResponse.status).toBe(201);
        expect(createResponse.body.item).toMatchObject({
            name: 'Acme Live',
            slug,
            status: 'active',
        });
        const tenantId = createResponse.body.item.id;
        tenantIds.push(tenantId);

        const listResponse = await request(app)
            .get('/tenants')
            .set('Authorization', `Bearer ${owner.accessToken}`);

        expect(listResponse.status).toBe(200);
        expect(listResponse.body.items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: 'owner',
                    status: 'active',
                    tenant: expect.objectContaining({ id: tenantId, slug }),
                }),
            ])
        );

        const getResponse = await request(app)
            .get(`/tenants/${tenantId}`)
            .set('Authorization', `Bearer ${owner.accessToken}`);

        expect(getResponse.status).toBe(200);
        expect(getResponse.body.item).toMatchObject({ id: tenantId, slug });
    });

    it('lets the owner update and archive their tenant via update_tenant/archive_tenant', async () => {
        const owner = await registerAndSignIn(app, { emailPrefix: 'owner-crud' });
        userIds.push(owner.id);

        const createResponse = await request(app)
            .post('/tenants')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Before Update', slug: uniqueSlug('crud') });
        const tenantId = createResponse.body.item.id;
        tenantIds.push(tenantId);

        const updateResponse = await request(app)
            .patch(`/tenants/${tenantId}`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'After Update' });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.item).toMatchObject({ id: tenantId, name: 'After Update' });

        const archiveResponse = await request(app)
            .delete(`/tenants/${tenantId}`)
            .set('Authorization', `Bearer ${owner.accessToken}`);

        expect(archiveResponse.status).toBe(200);
        expect(archiveResponse.body.item).toMatchObject({ id: tenantId, status: 'archived' });
    });

    it('does not let a non-member see or modify someone else tenant (RLS boundary)', async () => {
        const owner = await registerAndSignIn(app, { emailPrefix: 'owner-rls' });
        const outsider = await registerAndSignIn(app, { emailPrefix: 'outsider' });
        userIds.push(owner.id, outsider.id);

        const createResponse = await request(app)
            .post('/tenants')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Private Tenant', slug: uniqueSlug('private') });
        const tenantId = createResponse.body.item.id;
        tenantIds.push(tenantId);

        const getAsOutsider = await request(app)
            .get(`/tenants/${tenantId}`)
            .set('Authorization', `Bearer ${outsider.accessToken}`);
        expect(getAsOutsider.status).toBe(404);

        const listAsOutsider = await request(app)
            .get('/tenants')
            .set('Authorization', `Bearer ${outsider.accessToken}`);
        expect(listAsOutsider.status).toBe(200);
        expect(listAsOutsider.body.items).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ tenant: expect.objectContaining({ id: tenantId }) }),
            ])
        );

        const patchAsOutsider = await request(app)
            .patch(`/tenants/${tenantId}`)
            .set('Authorization', `Bearer ${outsider.accessToken}`)
            .send({ name: 'Hijacked' });
        expect(patchAsOutsider.status).toBe(404);
    });
});
