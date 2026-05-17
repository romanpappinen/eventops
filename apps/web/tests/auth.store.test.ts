import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const getSession = vi.fn()
const onAuthStateChange = vi.fn()
const signInWithPassword = vi.fn()
const signOut = vi.fn()

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      signInWithPassword,
      signOut,
    },
  },
}))

describe('auth store login flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })
  })

  it('hydrates backend user data after a successful login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: 'user-123',
          email: 'user@example.com',
          fullName: 'Example User',
          avatarUrl: null,
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
        },
        user: {
          id: 'user-123',
          email: 'user@example.com',
          user_metadata: {
            full_name: 'Example User',
          },
        },
      },
      error: null,
    })

    const { useAuthStore } = await import('../src/stores/auth')
    const store = useAuthStore()

    const success = await store.login('user@example.com', 'secret')

    expect(success).toBe(true)
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret',
    })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/auth/me', {
      headers: {
        Authorization: 'Bearer access-token',
      },
    })
    expect(store.status).toBe('authenticated')
    expect(store.user).toEqual({
      id: 'user-123',
      email: 'user@example.com',
      fullName: 'Example User',
      avatarUrl: null,
    })
    expect(store.greeting).toBe('Welcome back, Example User.')
  })

  it('surfaces backend hydration errors after Supabase login succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Unauthorized',
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'bad-token',
        },
        user: {
          id: 'user-123',
          email: 'user@example.com',
          user_metadata: {},
        },
      },
      error: null,
    })

    const { useAuthStore } = await import('../src/stores/auth')
    const store = useAuthStore()

    const success = await store.login('user@example.com', 'secret')

    expect(success).toBe(false)
    expect(store.status).toBe('error')
    expect(store.error).toBe('Unauthorized')
    expect(store.user).toBeNull()
  })
})
