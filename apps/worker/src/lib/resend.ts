import { parseWorkerEnv } from '@eventops/config';

interface SendInvitationEmailInput {
    inviterEmail: string;
    inviterName?: string | null;
    recipientEmail: string;
    role: string;
    tenantName: string;
    inviteLink: string;
}

interface ResendEmailResponse {
    id?: string;
    error?: {
        message?: string;
    };
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildInvitationHtml(input: SendInvitationEmailInput) {
    const inviter = input.inviterName?.trim() || input.inviterEmail;

    return `
      <div style="font-family: sans-serif; line-height: 1.5; color: #111827;">
        <h1 style="font-size: 20px;">You have been invited to join ${escapeHtml(input.tenantName)}</h1>
        <p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(input.tenantName)}</strong> as <strong>${escapeHtml(input.role)}</strong>.</p>
        <p><a href="${escapeHtml(input.inviteLink)}" style="display: inline-block; padding: 10px 16px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">Accept invitation</a></p>
        <p>If the button does not work, use this link:</p>
        <p><a href="${escapeHtml(input.inviteLink)}">${escapeHtml(input.inviteLink)}</a></p>
      </div>
    `.trim();
}

function buildInvitationText(input: SendInvitationEmailInput) {
    const inviter = input.inviterName?.trim() || input.inviterEmail;

    return [
        `You have been invited to join ${input.tenantName}.`,
        `${inviter} invited you as ${input.role}.`,
        `Accept invitation: ${input.inviteLink}`,
    ].join('\n');
}

export async function sendTenantInvitationEmail(input: SendInvitationEmailInput) {
    const env = parseWorkerEnv(process.env);
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: env.INVITATION_FROM_EMAIL,
            to: [input.recipientEmail],
            subject: `You've been invited to join ${input.tenantName}`,
            html: buildInvitationHtml(input),
            text: buildInvitationText(input),
        }),
    });

    const payload = (await response.json()) as ResendEmailResponse;

    if (!response.ok || payload.error) {
        throw new Error(payload.error?.message ?? 'Resend email send failed');
    }

    if (!payload.id) {
        throw new Error('Resend email send did not return a message id');
    }

    return {
        messageId: payload.id,
    };
}
