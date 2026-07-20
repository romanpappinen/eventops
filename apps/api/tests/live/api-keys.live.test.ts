import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import {
    cleanupLiveTestData,
    getServiceRoleClient,
    registerAndSignIn,
    uniqueSlug,
} from './support/live-client.js';

describe('api keys against a real local Supabase stack', () => {
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
            .send({ name: 'API Keys Live', slug: uniqueSlug(slugPrefix) });
        const tenantId = createResponse.body.item.id as string;
        tenantIds.push(tenantId);
        return { owner, tenantId };
    }

    it('lets an owner create, list, and revoke a key -- raw key never returned again after creation', async () => {
        const { owner, tenantId } = await createOwnerWithTenant('api-keys-crud');

        const createResponse = await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Production backend' });

        expect(createResponse.status).toBe(201);
        expect(createResponse.body.item.rawKey).toMatch(/^eo_live_/);
        const apiKeyId = createResponse.body.item.id as string;

        const listResponse = await request(app)
            .get(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', `Bearer ${owner.accessToken}`);

        expect(listResponse.status).toBe(200);
        expect(listResponse.body.items).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: apiKeyId })])
        );
        expect(listResponse.body.items[0]).not.toHaveProperty('rawKey');
        expect(listResponse.body.items[0]).not.toHaveProperty('keyHash');

        const revokeResponse = await request(app)
            .delete(`/tenants/${tenantId}/api-keys/${apiKeyId}`)
            .set('Authorization', `Bearer ${owner.accessToken}`);

        expect(revokeResponse.status).toBe(200);
        expect(revokeResponse.body.item.revokedAt).not.toBeNull();
    });

    it('returns 403 when a non-owner member tries to create or list keys (RLS boundary)', async () => {
        const { owner, tenantId } = await createOwnerWithTenant('api-keys-member');
        const member = await registerAndSignIn(app, { emailPrefix: 'api-keys-member-user' });
        userIds.push(member.id);

        const inviteResponse = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ email: member.email, role: 'member' });
        expect(inviteResponse.status).toBe(201);

        // Directly promote the invitation to an active membership via the
        // service-role client so this test focuses on api-key authorization,
        // not the invitation-accept flow already covered elsewhere.
        await getServiceRoleClient().from('memberships').insert({
            tenant_id: tenantId,
            user_id: member.id,
            role: 'member',
            status: 'active',
        });

        const createAsMember = await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', `Bearer ${member.accessToken}`)
            .send({ name: 'Should not be allowed' });
        expect(createAsMember.status).toBe(403);

        const listAsMember = await request(app)
            .get(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', `Bearer ${member.accessToken}`);
        expect(listAsMember.status).toBe(403);
    });

    it("does not let a non-member see a tenant's API keys at all (RLS boundary)", async () => {
        const { owner, tenantId } = await createOwnerWithTenant('api-keys-outsider');
        await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ name: 'Owner-only key' });

        const outsider = await registerAndSignIn(app, { emailPrefix: 'api-keys-outsider-user' });
        userIds.push(outsider.id);

        const listAsOutsider = await request(app)
            .get(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', `Bearer ${outsider.accessToken}`);
        expect(listAsOutsider.status).toBe(404);
    });
});
