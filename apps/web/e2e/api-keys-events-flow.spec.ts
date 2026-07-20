import { expect, test } from '@playwright/test'

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test.describe('API keys + events log — real browser against real Supabase', () => {
  test('owner creates an API key, ingests an event server-to-server, sees it attributed, then revokes the key', async ({
    page,
    request,
  }) => {
    const suffix = uniqueSuffix()
    const ownerEmail = `e2e-owner-${suffix}@example.com`
    const password = 'E2ETestPassword123!'
    const tenantName = `E2E Tenant ${suffix}`
    const apiKeyName = `E2E backend ${suffix}`

    page.on('dialog', (dialog) => dialog.accept())

    // Register + login
    await page.goto('/register')
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill('Owner')
    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/')

    // Create tenant
    await page.goto('/tenants')
    await page.getByRole('link', { name: 'Create your first tenant' }).click()
    await expect(page).toHaveURL(/\/tenants\/new/)
    await page.getByLabel('Name').fill(tenantName)
    await page.getByRole('button', { name: 'Create tenant' }).click()
    await expect(page).toHaveURL(/\/tenants\/.+\/edit\?created=1/)

    // Create an API key
    await page.getByLabel('Key name').fill(apiKeyName)
    await page.getByRole('button', { name: 'Create API key' }).click()
    await expect(page.getByText('Copy this key now -- you will not be able to see it again.')).toBeVisible()
    await page.screenshot({ path: 'e2e-artifacts/api-key-01-created.png' })

    const rawKey = await page.locator('code.raw-key-value').innerText()
    expect(rawKey).toMatch(/^eo_live_/)

    const keyRow = page.locator('tr', { has: page.getByText(apiKeyName, { exact: true }) })
    await expect(keyRow).toBeVisible()
    await expect(keyRow.locator('td').nth(4)).toHaveText('Active')

    // Copy to clipboard button is present and clickable
    await page.getByRole('button', { name: 'Copy to clipboard' }).click()

    // Navigate to the events log page
    await page.getByRole('link', { name: 'View events log' }).click()
    await expect(page).toHaveURL(/\/tenants\/.+\/events/)
    await expect(page.getByText('No events yet.')).toBeVisible()

    // Create a manual event as the signed-in owner
    await page.getByLabel('Source').fill('web-app')
    await page.getByLabel('Type').fill('order.created')
    await page.getByLabel('Occurred at').fill('2026-07-20T10:00')
    await page.getByLabel('Payload (JSON)').fill('{"orderId": "manual-1"}')
    await page.getByRole('button', { name: 'Create event' }).click()
    await expect(page.getByText('Event created.')).toBeVisible()

    const manualRow = page.locator('tr', { has: page.getByText('web-app', { exact: true }) })
    await expect(manualRow).toBeVisible()
    await expect(manualRow.locator('td').last()).toHaveText('You')
    await page.screenshot({ path: 'e2e-artifacts/api-key-02-manual-event.png' })

    // Simulate an external backend: POST /events with only the raw API key,
    // zero Supabase session -- exactly what a real integration would send.
    const apiBaseUrl = 'http://localhost:3000'
    const ingestResponse = await request.post(`${apiBaseUrl}/events`, {
      headers: { Authorization: `Bearer ${rawKey}` },
      data: {
        source: 'external-backend',
        type: 'order.created',
        occurredAt: new Date().toISOString(),
        payload: { orderId: 'e2e-ingest-1' },
      },
    })
    expect(ingestResponse.status()).toBe(201)
    const ingestBody = await ingestResponse.json()
    expect(ingestBody.item.createdByUserId).toBeNull()
    expect(ingestBody.item.createdByApiKeyId).toBeTruthy()

    // Reload the events page and confirm the ingested event shows up
    // attributed to the API key, not to a human.
    await page.reload()
    const ingestedRow = page.locator('tr', { has: page.getByText('external-backend', { exact: true }) })
    await expect(ingestedRow).toBeVisible()
    await expect(ingestedRow.locator('td').last()).toHaveText(`API: ${apiKeyName}`)
    await page.screenshot({ path: 'e2e-artifacts/api-key-03-ingested-event.png' })

    // Revoke the key via the tenant settings page
    await page.getByRole('link', { name: 'Back to tenant settings' }).click()
    await expect(page).toHaveURL(/\/tenants\/.+\/edit/)
    await keyRow.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByText(`API key "${apiKeyName}" revoked.`)).toBeVisible()
    await expect(keyRow.locator('td').nth(4)).toHaveText('Revoked')
    await page.screenshot({ path: 'e2e-artifacts/api-key-04-revoked.png' })

    // The revoked key must no longer authenticate ingestion.
    const revokedResponse = await request.post(`${apiBaseUrl}/events`, {
      headers: { Authorization: `Bearer ${rawKey}` },
      data: {
        source: 'external-backend',
        type: 'order.created',
        occurredAt: new Date().toISOString(),
        payload: {},
      },
    })
    expect(revokedResponse.status()).toBe(401)
  })
})
