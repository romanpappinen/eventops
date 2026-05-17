import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const { signUp, ensureUserProfile } = vi.hoisted(() => ({
    signUp: vi.fn(),
    ensureUserProfile: vi.fn(),
}));

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAuth: vi.fn(),
    getSupabaseAdmin: () => ({
        auth: {
            admin: {
                createUser: signUp,
            },
        },
    }),
}));

vi.mock('../../src/modules/auth/ensure-user-profile.js', () => ({
    ensureUserProfile,
}));

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /auth/register', () => {
    it('returns 400 when the payload is invalid', async () => {
        const app = createApp();

        const response = await request(app).post('/auth/register').send({
            firstName: '',
            lastName: 'User',
            email: 'not-an-email',
            password: '123',
        });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request',
        });
        expect(signUp).not.toHaveBeenCalled();
    });

    it('returns 409 when the email is already registered', async () => {
        signUp.mockResolvedValue({
            data: {
                user: null,
                session: null,
            },
            error: {
                message: 'User already registered',
            },
        });

        const app = createApp();

        const response = await request(app).post('/auth/register').send({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'Email already registered',
        });
        expect(ensureUserProfile).not.toHaveBeenCalled();
    });

    it('creates the auth user and persists the app profile', async () => {
        signUp.mockResolvedValue({
            data: {
                user: {
                    id: 'user-123',
                    email: 'ada@example.com',
                },
                session: null,
            },
            error: null,
        });

        const app = createApp();

        const response = await request(app).post('/auth/register').send({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'Ada@example.com',
            password: 'secret123',
        });

        expect(signUp).toHaveBeenCalledWith({
            email: 'ada@example.com',
            password: 'secret123',
            email_confirm: true,
            user_metadata: {
                full_name: 'Ada Lovelace',
            },
        });
        expect(ensureUserProfile).toHaveBeenCalledWith({
            id: 'user-123',
            email: 'ada@example.com',
            fullName: 'Ada Lovelace',
            avatarUrl: null,
        });
        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            item: {
                id: 'user-123',
                email: 'ada@example.com',
                fullName: 'Ada Lovelace',
                avatarUrl: null,
            },
            requiresEmailConfirmation: false,
            message: 'Registration succeeded. Sign in with your new account.',
        });
    });

    it('returns 502 for unexpected Supabase signup failures', async () => {
        signUp.mockResolvedValue({
            data: {
                user: null,
                session: null,
            },
            error: {
                message: 'Upstream service timeout',
            },
        });

        const app = createApp();

        const response = await request(app).post('/auth/register').send({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: 'Registration is temporarily unavailable',
        });
    });

    it('returns 500 when the profile write fails after auth signup', async () => {
        signUp.mockResolvedValue({
            data: {
                user: {
                    id: 'user-123',
                    email: 'ada@example.com',
                },
                session: null,
            },
            error: null,
        });
        ensureUserProfile.mockRejectedValue(new Error('insert failed'));

        const app = createApp();

        const response = await request(app).post('/auth/register').send({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: 'Registration failed while creating the user profile',
        });
    });
});
