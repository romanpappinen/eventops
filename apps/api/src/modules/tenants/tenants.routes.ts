import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/require-auth.js';
import { ensureUserProfile } from '../auth/ensure-user-profile.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { createTenantSchema } from './tenant.schemas.js';

export const tenantsRouter = Router();

tenantsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.id;

    const { data, error } = await supabaseAdmin
        .from('memberships')
        .select(`
      id,
      role,
      status,
      tenant:tenants (
        id,
        name,
        slug,
        plan,
        status,
        created_at
      )
    `)
        .eq('user_id', userId)
        .eq('status', 'active');

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    return res.json({ items: data });
});

tenantsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const parsed = createTenantSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request',
            details: parsed.error.flatten(),
        });
    }

    const authUser = req.authUser!;

    await ensureUserProfile({
        id: authUser.id,
        email: authUser.email ?? 'unknown@example.com',
        fullName: authUser.fullName,
        avatarUrl: authUser.avatarUrl,
    });

    const { data: tenant, error: tenantError } = await supabaseAdmin
        .from('tenants')
        .insert({
            name: parsed.data.name,
            slug: parsed.data.slug,
            created_by_user_id: authUser.id,
        })
        .select()
        .single();

    if (tenantError) {
        return res.status(400).json({ error: tenantError.message });
    }

    const { error: membershipError } = await supabaseAdmin
        .from('memberships')
        .insert({
            tenant_id: tenant.id,
            user_id: authUser.id,
            role: 'owner',
            status: 'active',
        });

    if (membershipError) {
        return res.status(500).json({ error: membershipError.message });
    }

    return res.status(201).json({ item: tenant });
});
