import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { RegisterInput } from './auth.schemas.js';
import { ensureUserProfile } from './ensure-user-profile.js';

export function getCurrentUser(authUser: NonNullable<AuthenticatedRequest['authUser']>) {
    return {
        id: authUser.id,
        email: authUser.email ?? null,
        fullName: authUser.fullName ?? null,
        avatarUrl: authUser.avatarUrl ?? null,
    };
}

interface RegisterUserResult {
    item: {
        id: string;
        email: string;
        fullName: string;
        avatarUrl: null;
    };
    requiresEmailConfirmation: boolean;
    message?: string;
}

export async function registerUser(input: RegisterInput): Promise<RegisterUserResult> {
    const supabaseAdmin = getSupabaseAdmin();
    const fullName = `${input.firstName} ${input.lastName}`.trim();

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
            full_name: fullName,
        },
    });

    if (error) {
        const message = error.message.toLowerCase();

        if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
            const conflictError = new Error('Email already registered');
            (conflictError as Error & { statusCode?: number }).statusCode = 409;
            throw conflictError;
        }

        if (
            message.includes('password') ||
            message.includes('email') ||
            message.includes('invalid') ||
            message.includes('signup')
        ) {
            const requestError = new Error(error.message);
            (requestError as Error & { statusCode?: number }).statusCode = 400;
            throw requestError;
        }

        const upstreamError = new Error('Registration is temporarily unavailable');
        (upstreamError as Error & { statusCode?: number }).statusCode = 502;
        throw upstreamError;
    }

    const authUser = data.user;

    if (!authUser) {
        const registrationError = new Error('Registration did not return a user');
        (registrationError as Error & { statusCode?: number }).statusCode = 500;
        throw registrationError;
    }

    try {
        await ensureUserProfile({
            id: authUser.id,
            email: authUser.email ?? input.email,
            fullName,
            avatarUrl: null,
        });
    } catch {
        const profileError = new Error('Registration failed while creating the user profile');
        (profileError as Error & { statusCode?: number }).statusCode = 500;
        throw profileError;
    }

    return {
        item: {
            id: authUser.id,
            email: authUser.email ?? input.email,
            fullName,
            avatarUrl: null,
        },
        requiresEmailConfirmation: false,
        message: 'Registration succeeded. Sign in with your new account.',
    };
}
