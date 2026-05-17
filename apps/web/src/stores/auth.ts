import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthMeUser } from '../lib/api'
import { getCurrentUser, registerUser as registerUserRequest } from '../lib/api'
import { supabase } from '../lib/supabase'

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error'
type RegisterResult = 'pending_confirmation' | 'error'

let authSubscriptionReady = false
let initializePromise: Promise<void> | null = null

function getDisplayName(user: User | null) {
  if (!user) {
    return null
  }

  const metadataName = user.user_metadata?.full_name
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName
  }

  return user.email ?? null
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null as Session | null,
    supabaseUser: null as User | null,
    user: null as AuthMeUser | null,
    status: 'idle' as AuthStatus,
    error: null as string | null,
    initialized: false,
    registrationMessage: null as string | null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.session && state.user),
    greeting: (state) => {
      const backendName = state.user?.fullName ?? state.user?.email
      if (backendName) {
        return `Welcome back, ${backendName}.`
      }

      const name = getDisplayName(state.supabaseUser)
      return name ? `Welcome back, ${name}.` : 'Welcome back.'
    },
  },
  actions: {
    async applySession(session: Session | null) {
      this.session = session
      this.supabaseUser = session?.user ?? null

      if (!session) {
        this.user = null
        this.status = 'idle'
        return
      }

      try {
        this.user = await getCurrentUser(session.access_token)
        this.status = 'authenticated'
      } catch (currentUserError) {
        this.user = null
        this.status = 'error'
        this.error =
          currentUserError instanceof Error
            ? currentUserError.message
            : 'Failed to load current user'
      }
    },
    async initialize() {
      if (this.initialized) {
        return
      }

      if (!authSubscriptionReady) {
        authSubscriptionReady = true

        supabase.auth.onAuthStateChange(async (_event, session) => {
          await this.applySession(session)

          if (!session) {
            this.error = null
          }
        })
      }

      if (initializePromise) {
        return initializePromise
      }

      initializePromise = (async () => {
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          this.status = 'error'
          this.error = error.message
          this.initialized = true
          return
        }

        await this.applySession(data.session)
        this.initialized = true
      })().finally(() => {
        initializePromise = null
      })

      return initializePromise
    },
    async login(email: string, password: string) {
      this.status = 'loading'
      this.error = null
      this.registrationMessage = null

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        this.session = null
        this.supabaseUser = null
        this.user = null
        this.status = 'error'
        this.error = error.message
        return false
      }

      if (!data.session) {
        this.user = null
        this.status = 'error'
        this.error = 'Login did not return a session'
        return false
      }

      await this.applySession(data.session)
      this.initialized = true
      return this.isAuthenticated
    },
    async register(
      firstName: string,
      lastName: string,
      email: string,
      password: string,
    ): Promise<RegisterResult> {
      this.status = 'loading'
      this.error = null
      this.registrationMessage = null

      try {
        const result = await registerUserRequest({
          firstName,
          lastName,
          email,
          password,
        })

        this.registrationMessage =
          result.message ??
          (result.requiresEmailConfirmation
            ? 'Registration succeeded. Check your email to confirm your account.'
            : 'Registration succeeded. Sign in with your new account.')
        this.status = 'idle'
        this.initialized = true
        return 'pending_confirmation'
      } catch (error) {
        this.status = 'error'
        this.error = error instanceof Error ? error.message : 'Registration failed'
        return 'error'
      }
    },
    async logout() {
      const { error } = await supabase.auth.signOut()

      if (error) {
        this.status = 'error'
        this.error = error.message
        return
      }

      this.session = null
      this.supabaseUser = null
      this.user = null
      this.status = 'idle'
      this.error = null
      this.registrationMessage = null
      this.initialized = true
    },
  },
})
