import { afterEach, describe, expect, it, vi } from 'vitest';

const { updateInvitationEmailJob, updateTenantInvitation } = vi.hoisted(() => ({
    updateInvitationEmailJob: vi.fn().mockResolvedValue(undefined),
    updateTenantInvitation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/supabase-rest.js', () => ({
    updateInvitationEmailJob,
    updateTenantInvitation,
}));

import { markJobFailure, markJobSuccess } from '../src/invitation-email-worker.js';

const baseJob = {
    id: 'job-1',
    invitation_id: 'invitation-1',
    accept_token: 'plaintext-token',
};

afterEach(() => {
    vi.clearAllMocks();
});

describe('markJobFailure', () => {
    it('keeps the job pending and pushes scheduled_at out when attempts have not been exhausted', async () => {
        await markJobFailure({ ...baseJob, attempts: 2 }, 'SMTP timeout');

        expect(updateInvitationEmailJob).toHaveBeenCalledWith(
            'job-1',
            expect.objectContaining({
                status: 'pending',
                attempts: 3,
                accept_token: 'plaintext-token',
                last_error: 'SMTP timeout',
                processed_at: null,
            })
        );
    });

    it('marks the job failed and clears the accept token once attempts are exhausted', async () => {
        await markJobFailure({ ...baseJob, attempts: 4 }, 'SMTP timeout');

        expect(updateInvitationEmailJob).toHaveBeenCalledWith(
            'job-1',
            expect.objectContaining({
                status: 'failed',
                attempts: 5,
                accept_token: null,
                last_error: 'SMTP timeout',
                processed_at: expect.any(String),
            })
        );
        expect(updateTenantInvitation).toHaveBeenCalledWith(
            'invitation-1',
            expect.objectContaining({
                email_delivery_status: 'failed',
                delivery_attempts: 5,
            })
        );
    });
});

describe('markJobSuccess', () => {
    it('marks the job sent and clears the accept token', async () => {
        await markJobSuccess({ ...baseJob, attempts: 0 }, 'msg_123');

        expect(updateInvitationEmailJob).toHaveBeenCalledWith(
            'job-1',
            expect.objectContaining({
                status: 'sent',
                attempts: 1,
                accept_token: null,
                last_error: null,
                processed_at: expect.any(String),
            })
        );
        expect(updateTenantInvitation).toHaveBeenCalledWith(
            'invitation-1',
            expect.objectContaining({
                email_delivery_status: 'sent',
                email_message_id: 'msg_123',
            })
        );
    });
});
