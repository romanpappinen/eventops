import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { ApiError } from '../../lib/api-error.js';
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
            throw new ApiError(409, 'Email already registered');
        }

        if (
            message.includes('password') ||
            message.includes('email') ||
            message.includes('invalid') ||
            message.includes('signup')
        ) {
            throw new ApiError(400, error.message);
        }

        throw new ApiError(502, 'Registration is temporarily unavailable');
    }

    const authUser = data.user;

    if (!authUser) {
        throw new ApiError(500, 'Registration did not return a user');
    }

    try {
        await ensureUserProfile({
            id: authUser.id,
            email: authUser.email ?? input.email,
            fullName,
            avatarUrl: null,
        });
    } catch {
        throw new ApiError(500, 'Registration failed while creating the user profile');
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
