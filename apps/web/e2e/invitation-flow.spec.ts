import { expect, test } from '@playwright/test'

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test.describe('invitation list/resend/revoke — real browser against real Supabase', () => {
  test('owner registers, creates a tenant, invites, resends, and revokes an invitation', async ({
    page,
  }) => {
    const suffix = uniqueSuffix()
    const ownerEmail = `e2e-owner-${suffix}@example.com`
    const password = 'E2ETestPassword123!'
    const tenantName = `E2E Tenant ${suffix}`
    const inviteeEmail = `e2e-invitee-${suffix}@example.com`

    page.on('dialog', (dialog) => dialog.accept())

    // Register
    await page.goto('/register')
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill('Owner')
    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.screenshot({ path: 'e2e-artifacts/01-register-filled.png' })
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/login/)

    // Login
    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByText(`Welcome back, E2E Owner.`)).toBeVisible()
    await page.screenshot({ path: 'e2e-artifacts/02-home-authenticated.png' })

    // Create tenant
    await page.goto('/tenants')
    await page.getByRole('link', { name: 'Create your first tenant' }).click()
    await expect(page).toHaveURL(/\/tenants\/new/)
    await page.getByLabel('Name').fill(tenantName)
    await page.getByRole('button', { name: 'Create tenant' }).click()
    await expect(page).toHaveURL(/\/tenants\/.+\/edit\?created=1/)
    await expect(page.getByText('Tenant created. You are now the owner and can invite members.')).toBeVisible()
    await expect(page.getByRole('heading', { name: tenantName })).toBeVisible()
    await page.screenshot({ path: 'e2e-artifacts/03-tenant-created.png' })

    // Invite a member
    await page.getByLabel('Email').fill(inviteeEmail)
    await page.getByRole('button', { name: 'Invite member' }).click()
    await expect(page.getByText(`Invitation created for ${inviteeEmail}.`)).toBeVisible()

    const invitationRow = page.locator('tr', { has: page.getByText(inviteeEmail, { exact: true }) })
    const statusCell = invitationRow.locator('td').nth(2)
    await expect(invitationRow).toBeVisible()
    await expect(statusCell).toHaveText('pending')
    await expect(invitationRow.getByRole('button', { name: 'Resend' })).toBeVisible()
    await expect(invitationRow.getByRole('button', { name: 'Revoke' })).toBeVisible()
    await page.screenshot({ path: 'e2e-artifacts/04-invitation-listed.png' })

    // Resend
    await invitationRow.getByRole('button', { name: 'Resend' }).click()
    await expect(page.getByText(`Invitation resent to ${inviteeEmail}.`)).toBeVisible()
    await expect(statusCell).toHaveText('pending')
    await page.screenshot({ path: 'e2e-artifacts/05-invitation-resent.png' })

    // Revoke
    await invitationRow.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByText(`Invitation for ${inviteeEmail} revoked.`)).toBeVisible()
    await expect(statusCell).toHaveText('revoked')
    await expect(invitationRow.getByRole('button', { name: 'Resend' })).toHaveCount(0)
    await expect(invitationRow.getByRole('button', { name: 'Revoke' })).toHaveCount(0)
    await page.screenshot({ path: 'e2e-artifacts/06-invitation-revoked.png' })
  })
})
