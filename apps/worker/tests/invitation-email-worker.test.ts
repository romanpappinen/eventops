import { afterEach, describe, expect, it, vi } from 'vitest';

const { markInvitationEmailJobSent, markInvitationEmailJobFailed, updateTenantInvitation } = vi.hoisted(() => ({
    markInvitationEmailJobSent: vi.fn().mockResolvedValue(undefined),
    markInvitationEmailJobFailed: vi.fn().mockResolvedValue(undefined),
    updateTenantInvitation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/supabase-rest.js', () => ({
    markInvitationEmailJobSent,
    markInvitationEmailJobFailed,
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

        expect(markInvitationEmailJobFailed).toHaveBeenCalledWith(
            'job-1',
            expect.objectContaining({
                status: 'pending',
                attempts: 3,
                lastError: 'SMTP timeout',
                terminal: false,
            })
        );
    });

    it('marks the job failed and clears the accept token once attempts are exhausted', async () => {
        await markJobFailure({ ...baseJob, attempts: 4 }, 'SMTP timeout');

        expect(markInvitationEmailJobFailed).toHaveBeenCalledWith(
            'job-1',
            expect.objectContaining({
                status: 'failed',
                attempts: 5,
                lastError: 'SMTP timeout',
                terminal: true,
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

        expect(markInvitationEmailJobSent).toHaveBeenCalledWith('job-1', 1);
        expect(updateTenantInvitation).toHaveBeenCalledWith(
            'invitation-1',
            expect.objectContaining({
                email_delivery_status: 'sent',
                email_message_id: 'msg_123',
            })
        );
    });
});
