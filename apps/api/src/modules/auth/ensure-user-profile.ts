import { getSupabaseUser } from '../../lib/supabase.js';

interface EnsureUserProfileInput {
    id: string;
    email: string;
    fullName?: string | null;
    avatarUrl?: string | null;
}

export async function ensureUserProfile(authToken: string, input: EnsureUserProfileInput) {
    const supabaseUser = getSupabaseUser(authToken);
    const { error } = await supabaseUser.from('users').upsert(
        {
            id: input.id,
            email: input.email,
            full_name: input.fullName ?? null,
            avatar_url: input.avatarUrl ?? null,
            updated_at: new Date().toISOString(),
        },
        {
            onConflict: 'id',
        }
    );

    if (error) {
        throw error;
    }
}
