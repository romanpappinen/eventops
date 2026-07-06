export interface AuthMeUser {
  id: string
  email: string | null
  fullName: string | null
  avatarUrl: string | null
}

export interface Tenant {
  id: string
  name: string
  description: string | null
  slug: string
  plan: string
  status: string
  createdAt: string
}

export interface TenantInvitation {
  id: string
  tenantId: string
  email: string
  role: 'admin' | 'member'
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  invitedByUserId: string
  createdAt: string | null
  acceptedAt: string | null
  emailDeliveryStatus: 'pending' | 'sent' | 'failed'
  emailSentAt: string | null
  emailDeliveryError: string | null
  deliveryAttempts: number
  acceptTokenExpiresAt: string | null
}

export interface InvitationAcceptDetails {
  invitationId: string
  tenantId: string
  tenantName: string
  role: 'admin' | 'member'
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'archived'
  expiresAt: string | null
}

interface AuthMeResponse {
  item: AuthMeUser
}

interface RegisterResponse {
  item: AuthMeUser
  requiresEmailConfirmation: boolean
  message?: string
}

interface TenantMembershipRow {
  tenant?: {
    id: string
    name: string
    description?: string | null
    slug: string
    plan: string
    status: string
    created_at: string
  }
}

interface TenantsResponse {
  items: TenantMembershipRow[]
}

interface TenantResponse {
  item: {
    id: string
    name: string
    description?: string | null
    slug: string
    plan: string
    status: string
    created_at?: string
  }
}

interface TenantInvitationItem {
  id: string
  tenant_id: string
  email: string
  role: 'admin' | 'member'
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  invited_by_user_id: string
  created_at?: string | null
  accepted_at?: string | null
  email_delivery_status?: 'pending' | 'sent' | 'failed'
  email_sent_at?: string | null
  email_delivery_error?: string | null
  delivery_attempts?: number
  accept_token_expires_at?: string | null
}

interface TenantInvitationResponse {
  item: TenantInvitationItem
}

interface TenantInvitationsResponse {
  items: TenantInvitationItem[]
}

interface InvitationAcceptDetailsResponse {
  item: {
    invitationId: string
    tenantId: string
    tenantName: string
    role: 'admin' | 'member'
    status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'archived'
    expiresAt: string | null
  }
}

interface MembershipAcceptResponse {
  item: {
    id: string
    tenant_id: string
    user_id: string
    role: string
    status: string
    created_at?: string
  }
}

const defaultApiUrl = 'http://localhost:3000'

function getApiBaseUrl() {
  return import.meta.env.VITE_API_URL ?? defaultApiUrl
}

function createAuthHeaders(accessToken: string, contentType = false) {
  return {
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${accessToken}`,
  }
}

async function parseJson<T>(response: Response) {
  return (await response.json()) as T
}

function toTenantInvitation(item: TenantInvitationItem): TenantInvitation {
  return {
    id: item.id,
    tenantId: item.tenant_id,
    email: item.email,
    role: item.role,
    status: item.status,
    invitedByUserId: item.invited_by_user_id,
    createdAt: item.created_at ?? null,
    acceptedAt: item.accepted_at ?? null,
    emailDeliveryStatus: item.email_delivery_status ?? 'pending',
    emailSentAt: item.email_sent_at ?? null,
    emailDeliveryError: item.email_delivery_error ?? null,
    deliveryAttempts: item.delivery_attempts ?? 0,
    acceptTokenExpiresAt: item.accept_token_expires_at ?? null,
  }
}

function toTenant(item: TenantResponse['item'] | TenantMembershipRow['tenant']): Tenant {
  return {
    id: item?.id ?? '',
    name: item?.name ?? '',
    description: item?.description ?? null,
    slug: item?.slug ?? '',
    plan: item?.plan ?? '',
    status: item?.status ?? '',
    createdAt: item?.created_at ?? '',
  }
}

export async function getCurrentUser(accessToken: string) {
  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: createAuthHeaders(accessToken),
  })

  const body = (await response.json()) as Partial<AuthMeResponse> & { error?: string }

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Failed to load current user')
  }

  return body.item
}

export async function registerUser(input: {
  firstName: string
  lastName: string
  email: string
  password: string
}) {
  const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const body = (await response.json()) as Partial<RegisterResponse> & {
    error?: string
    details?: unknown
  }

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Registration failed')
  }

  return body
}

export async function getTenants(accessToken: string) {
  const response = await fetch(`${getApiBaseUrl()}/tenants`, {
    headers: createAuthHeaders(accessToken),
  })

  const body = await parseJson<Partial<TenantsResponse> & { error?: string }>(response)

  if (!response.ok || !Array.isArray(body.items)) {
    throw new Error(body.error ?? 'Failed to load tenants')
  }

  return body.items
    .map((membership) => membership.tenant)
    .filter((tenant): tenant is NonNullable<typeof tenant> => Boolean(tenant))
    .map((tenant) => toTenant(tenant))
}

export async function createTenant(
  accessToken: string,
  input: {
    name: string
    description?: string
    slug?: string
  },
) {
  const response = await fetch(`${getApiBaseUrl()}/tenants`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken, true),
    body: JSON.stringify(input),
  })

  const body = await parseJson<Partial<TenantResponse> & { error?: string }>(response)

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Failed to create tenant')
  }

  return toTenant(body.item)
}

export async function inviteTenantMember(
  accessToken: string,
  tenantId: string,
  input: {
    email: string
    role: 'admin' | 'member'
  },
) {
  const response = await fetch(`${getApiBaseUrl()}/tenants/${tenantId}/invitations`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken, true),
    body: JSON.stringify(input),
  })

  const body = await parseJson<Partial<TenantInvitationResponse> & { error?: string }>(response)

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Failed to invite tenant member')
  }

  return toTenantInvitation(body.item)
}

export async function listTenantInvitations(accessToken: string, tenantId: string) {
  const response = await fetch(`${getApiBaseUrl()}/tenants/${tenantId}/invitations`, {
    headers: createAuthHeaders(accessToken),
  })

  const body = await parseJson<Partial<TenantInvitationsResponse> & { error?: string }>(response)

  if (!response.ok || !Array.isArray(body.items)) {
    throw new Error(body.error ?? 'Failed to load invitations')
  }

  return body.items.map((item) => toTenantInvitation(item))
}

export async function resendTenantInvitation(
  accessToken: string,
  tenantId: string,
  invitationId: string,
) {
  const response = await fetch(
    `${getApiBaseUrl()}/tenants/${tenantId}/invitations/${invitationId}/resend`,
    {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
    },
  )

  const body = await parseJson<Partial<TenantInvitationResponse> & { error?: string }>(response)

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Failed to resend invitation')
  }

  return toTenantInvitation(body.item)
}

export async function revokeTenantInvitation(
  accessToken: string,
  tenantId: string,
  invitationId: string,
) {
  const response = await fetch(`${getApiBaseUrl()}/tenants/${tenantId}/invitations/${invitationId}`, {
    method: 'DELETE',
    headers: createAuthHeaders(accessToken),
  })

  const body = await parseJson<Partial<TenantInvitationResponse> & { error?: string }>(response)

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Failed to revoke invitation')
  }

  return toTenantInvitation(body.item)
}

export async function getInvitationAcceptDetails(accessToken: string, token: string) {
  const response = await fetch(
    `${getApiBaseUrl()}/invitations/accept?token=${encodeURIComponent(token)}`,
    {
      headers: createAuthHeaders(accessToken),
    },
  )

  const body = await parseJson<Partial<InvitationAcceptDetailsResponse> & { error?: string }>(response)

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Failed to load invitation')
  }

  return body.item satisfies InvitationAcceptDetails
}

export async function acceptInvitation(accessToken: string, token: string) {
  const response = await fetch(`${getApiBaseUrl()}/invitations/accept`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken, true),
    body: JSON.stringify({ token }),
  })

  const body = await parseJson<Partial<MembershipAcceptResponse> & { error?: string }>(response)

  if (!response.ok || !body.item) {
    throw new Error(body.error ?? 'Failed to accept invitation')
  }

  return body.item
}
