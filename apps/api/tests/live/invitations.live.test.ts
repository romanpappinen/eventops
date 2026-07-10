import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import {
    cleanupLiveTestData,
    getInvitationAcceptToken,
    registerAndSignIn,
    uniqueEmail,
    uniqueSlug,
} from './support/live-client.js';

async function createOwnerWithTenant(app: ReturnType<typeof createApp>, slugPrefix: string) {
    const owner = await registerAndSignIn(app, { emailPrefix: `${slugPrefix}-owner` });
    const createResponse = await request(app)
        .post('/tenants')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Invitations Live', slug: uniqueSlug(slugPrefix) });

    return { owner, tenantId: createResponse.body.item.id as string };
}

describe('invitations against a real local Supabase stack', () => {
    const app = createApp();
    const tenantIds: string[] = [];
    const userIds: string[] = [];

    afterAll(async () => {
        await cleanupLiveTestData({ tenantIds, userIds });
    });

    it('invites, resends, and accepts a real invitation end to end (create_tenant_invitation + accept_tenant_invitation_by_token RPCs)', async () => {
        const { owner, tenantId } = await createOwnerWithTenant(app, 'accept');
        userIds.push(owner.id);
        tenantIds.push(tenantId);

        const inviteeEmail = uniqueEmail('invitee');

        const inviteResponse = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ email: inviteeEmail, role: 'member' });

        expect(inviteResponse.status).toBe(201);
        expect(inviteResponse.body.item).toMatchObject({
            tenant_id: tenantId,
            email: inviteeEmail,
            role: 'member',
            status: 'pending',
            email_delivery_status: 'pending',
        });
        const invitationId = inviteResponse.body.item.id as string;

        const listResponse = await request(app)
            .get(`/tenants/${tenantId}/invitations`)
            .set('Authorization', `Bearer ${owner.accessToken}`);
        expect(listResponse.status).toBe(200);
        expect(listResponse.body.items).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: invitationId })])
        );

        const resendResponse = await request(app)
            .post(`/tenants/${tenantId}/invitations/${invitationId}/resend`)
            .set('Authorization', `Bearer ${owner.accessToken}`);
        expect(resendResponse.status).toBe(200);
        expect(resendResponse.body.item).toMatchObject({
            id: invitationId,
            status: 'pending',
            email_delivery_status: 'pending',
            delivery_attempts: 0,
        });

        const acceptToken = await getInvitationAcceptToken(invitationId);

        const invitee = await registerAndSignIn(app, { email: inviteeEmail, emailPrefix: 'unused' });
        userIds.push(invitee.id);

        const lookupResponse = await request(app)
            .get('/invitations/accept')
            .query({ token: acceptToken })
            .set('Authorization', `Bearer ${invitee.accessToken}`);
        expect(lookupResponse.status).toBe(200);
        expect(lookupResponse.body.item).toMatchObject({
            invitationId,
            tenantId,
            role: 'member',
            status: 'pending',
        });

        const acceptResponse = await request(app)
            .post('/invitations/accept')
            .set('Authorization', `Bearer ${invitee.accessToken}`)
            .send({ token: acceptToken });
        expect(acceptResponse.status).toBe(201);
        expect(acceptResponse.body.item).toMatchObject({
            tenant_id: tenantId,
            user_id: invitee.id,
            role: 'member',
            status: 'active',
        });

        const inviteeTenantsResponse = await request(app)
            .get('/tenants')
            .set('Authorization', `Bearer ${invitee.accessToken}`);
        expect(inviteeTenantsResponse.body.items).toEqual(
            expect.arrayContaining([expect.objectContaining({ tenant: expect.objectContaining({ id: tenantId }) })])
        );
    });

    it('revokes a pending invitation via revoke_tenant_invitation and blocks acceptance afterward', async () => {
        const { owner, tenantId } = await createOwnerWithTenant(app, 'revoke');
        userIds.push(owner.id);
        tenantIds.push(tenantId);

        const inviteeEmail = uniqueEmail('revokee');
        const inviteResponse = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ email: inviteeEmail, role: 'member' });
        const invitationId = inviteResponse.body.item.id as string;
        const acceptToken = await getInvitationAcceptToken(invitationId);

        const revokeResponse = await request(app)
            .delete(`/tenants/${tenantId}/invitations/${invitationId}`)
            .set('Authorization', `Bearer ${owner.accessToken}`);
        expect(revokeResponse.status).toBe(200);
        expect(revokeResponse.body.item).toMatchObject({ id: invitationId, status: 'revoked' });

        const invitee = await registerAndSignIn(app, { email: inviteeEmail, emailPrefix: 'unused' });
        userIds.push(invitee.id);

        const acceptResponse = await request(app)
            .post('/invitations/accept')
            .set('Authorization', `Bearer ${invitee.accessToken}`)
            .send({ token: acceptToken });
        expect(acceptResponse.status).toBe(404);
    });

    it('rejects invite/list/resend/revoke from a non-owner member (403)', async () => {
        const { owner, tenantId } = await createOwnerWithTenant(app, 'guard');
        userIds.push(owner.id);
        tenantIds.push(tenantId);

        const memberEmail = uniqueEmail('member');
        const inviteResponse = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ email: memberEmail, role: 'member' });
        const invitationId = inviteResponse.body.item.id as string;
        const acceptToken = await getInvitationAcceptToken(invitationId);

        const member = await registerAndSignIn(app, { email: memberEmail, emailPrefix: 'unused' });
        userIds.push(member.id);
        await request(app)
            .post('/invitations/accept')
            .set('Authorization', `Bearer ${member.accessToken}`)
            .send({ token: acceptToken });

        const inviteAsMember = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', `Bearer ${member.accessToken}`)
            .send({ email: uniqueEmail('blocked'), role: 'member' });
        expect(inviteAsMember.status).toBe(403);

        const listAsMember = await request(app)
            .get(`/tenants/${tenantId}/invitations`)
            .set('Authorization', `Bearer ${member.accessToken}`);
        expect(listAsMember.status).toBe(403);

        const resendAsMember = await request(app)
            .post(`/tenants/${tenantId}/invitations/${invitationId}/resend`)
            .set('Authorization', `Bearer ${member.accessToken}`);
        expect(resendAsMember.status).toBe(403);

        const revokeAsMember = await request(app)
            .delete(`/tenants/${tenantId}/invitations/${invitationId}`)
            .set('Authorization', `Bearer ${member.accessToken}`);
        expect(revokeAsMember.status).toBe(403);
    });
});
