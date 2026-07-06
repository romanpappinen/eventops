import { afterEach, describe, expect, it, vi } from 'vitest';

const { deleteTerminalInvitationEmailJobsOlderThan } = vi.hoisted(() => ({
    deleteTerminalInvitationEmailJobsOlderThan: vi.fn(),
}));

vi.mock('../src/lib/supabase-rest.js', () => ({
    deleteTerminalInvitationEmailJobsOlderThan,
}));

import {
    computeRetentionCutoff,
    runInvitationCleanupSweepOnce,
    runInvitationCleanupSweepTick,
} from '../src/invitation-cleanup-sweep.js';

afterEach(() => {
    vi.clearAllMocks();
});

describe('computeRetentionCutoff', () => {
    it('subtracts the retention window from the given time', () => {
        const now = new Date('2026-07-06T00:00:00.000Z');

        expect(computeRetentionCutoff(30, now)).toBe('2026-06-06T00:00:00.000Z');
    });
});

describe('runInvitationCleanupSweepOnce', () => {
    it('deletes terminal jobs older than the configured retention window', async () => {
        deleteTerminalInvitationEmailJobsOlderThan.mockResolvedValue(3);

        const deletedCount = await runInvitationCleanupSweepOnce();

        expect(deleteTerminalInvitationEmailJobsOlderThan).toHaveBeenCalledWith(
            expect.any(String)
        );
        expect(deletedCount).toBe(3);
    });
});

describe('runInvitationCleanupSweepTick', () => {
    it('does not throw when the delete call fails', async () => {
        deleteTerminalInvitationEmailJobsOlderThan.mockRejectedValue(new Error('boom'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(runInvitationCleanupSweepTick()).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith('boom');

        errorSpy.mockRestore();
    });
});
