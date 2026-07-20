<script setup lang="ts">
</script>

<template>
  <section class="docs-page">
    <div class="docs-card">
      <p class="eyebrow">Docs</p>
      <h1>Server-to-server event ingestion</h1>
      <p class="intro">
        This is how your own backend sends events into EventOps directly, without a human
        signing in. No Supabase session is involved on this path -- only an API key.
      </p>
    </div>

    <div class="docs-card">
      <p class="eyebrow">1. Create an API key</p>
      <h2>Get a key from your tenant settings</h2>
      <p class="intro">
        Open your tenant's settings page and use the "API Keys" card to create a key. Only
        tenant <strong>owners</strong> can create or revoke keys. The raw key
        (<code>eo_live_...</code>) is shown exactly once, right after creation -- copy it
        somewhere safe immediately, since it cannot be viewed again. If you lose it, revoke it
        and create a new one; keys can be freely rotated, and a tenant can have several active
        keys at once (for example, one per environment).
      </p>
    </div>

    <div class="docs-card">
      <p class="eyebrow">2. Send an event</p>
      <h2>Endpoint</h2>
      <p class="intro">
        Send a <code>POST</code> request to <code>/events</code> on the API host, with your raw
        key as a bearer token. This endpoint is not nested under a tenant path -- the tenant is
        resolved entirely from the key itself, so the same request shape works for every tenant.
      </p>

      <pre class="code-block"><code>POST /events HTTP/1.1
Host: &lt;your-api-host&gt;
Authorization: Bearer eo_live_...
Content-Type: application/json

{
  "source": "billing-service",
  "type": "invoice.paid",
  "subject": "invoice-4821",
  "occurredAt": "2026-07-20T10:15:00Z",
  "payload": { "amount": 4200, "currency": "USD" },
  "metadata": { "region": "eu" },
  "idempotencyKey": "invoice-4821-paid"
}</code></pre>

      <p class="intro">
        Locally, the API host is <code>http://localhost:3000</code>. In production it's whatever
        host your deployment uses (see <code>VITE_API_URL</code> / your Render service URL).
      </p>
    </div>

    <div class="docs-card">
      <p class="eyebrow">3. Request body</p>
      <h2>Fields</h2>

      <div class="table-panel">
        <table class="fields-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>source</code></td>
              <td>string</td>
              <td>Yes</td>
              <td>2-80 characters. Identifies where the event came from, e.g. <code>billing-service</code>.</td>
            </tr>
            <tr>
              <td><code>type</code></td>
              <td>string</td>
              <td>Yes</td>
              <td>2-120 characters, lowercase letters/digits/<code>.</code>/<code>_</code>/<code>-</code> only, e.g. <code>invoice.paid</code>.</td>
            </tr>
            <tr>
              <td><code>subject</code></td>
              <td>string</td>
              <td>No</td>
              <td>Up to 160 characters. The specific entity this event is about, e.g. an order or invoice id.</td>
            </tr>
            <tr>
              <td><code>occurredAt</code></td>
              <td>string</td>
              <td>Yes</td>
              <td>ISO 8601 datetime with a timezone offset, e.g. <code>2026-07-20T10:15:00Z</code>.</td>
            </tr>
            <tr>
              <td><code>payload</code></td>
              <td>object</td>
              <td>Yes</td>
              <td>Any JSON object. The event's actual data.</td>
            </tr>
            <tr>
              <td><code>metadata</code></td>
              <td>object</td>
              <td>No</td>
              <td>Any JSON object. Defaults to <code>{}</code>. For context that isn't part of the event data itself.</td>
            </tr>
            <tr>
              <td><code>idempotencyKey</code></td>
              <td>string</td>
              <td>No</td>
              <td>Up to 200 characters. See idempotency below.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="intro">
        The request body is validated strictly -- any extra field (including a stray
        <code>tenantId</code>) is rejected with <code>400</code>. The tenant always comes from
        the API key, never from anything in the request.
      </p>
    </div>

    <div class="docs-card">
      <p class="eyebrow">4. Response</p>
      <h2>Status codes</h2>

      <div class="table-panel">
        <table class="fields-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>201</code></td>
              <td>Event created. Body is <code>{ "item": &lt;event&gt; }</code>.</td>
            </tr>
            <tr>
              <td><code>200</code></td>
              <td>
                Idempotency replay -- a request with this <code>idempotencyKey</code> was already
                processed for this tenant. Returns the original event, not a duplicate.
              </td>
            </tr>
            <tr>
              <td><code>400</code></td>
              <td>Request body failed validation (missing/invalid/extra fields).</td>
            </tr>
            <tr>
              <td><code>401</code></td>
              <td>Missing, unknown, or revoked API key.</td>
            </tr>
            <tr>
              <td><code>409</code></td>
              <td>The tenant is archived and cannot accept new events.</td>
            </tr>
            <tr>
              <td><code>429</code></td>
              <td>
                Either the per-tenant daily event quota was exceeded, or the ingestion rate
                limit (120 requests/minute per caller IP) was hit.
              </td>
            </tr>
            <tr>
              <td><code>503</code></td>
              <td>The auth lookup itself failed (transient). Safe to retry.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="docs-card">
      <p class="eyebrow">5. Idempotency</p>
      <h2>Safe retries</h2>
      <p class="intro">
        If you pass an <code>idempotencyKey</code>, a second request with the same key for the
        same tenant will not create a duplicate event -- it returns the original event with
        <code>200</code> instead of <code>201</code>. This makes it safe to retry a request after
        a timeout or a network error without double-processing an event on your side.
      </p>
    </div>

    <div class="docs-card">
      <p class="eyebrow">6. Where events show up</p>
      <h2>Attribution</h2>
      <p class="intro">
        Every event sent through this endpoint is attributed to the API key that sent it, and
        shows up in the tenant's events log (in the app, from the tenant settings page) labeled
        "API: <em>&lt;key name&gt;</em>". Events created manually by a signed-in user in the UI
        are attributed to that person instead. This is how you can tell which integration
        produced a given event.
      </p>
    </div>

    <div class="docs-card">
      <p class="eyebrow">Example</p>
      <h2>curl</h2>
      <pre class="code-block"><code>curl -X POST http://localhost:3000/events \
  -H "Authorization: Bearer eo_live_your_raw_key" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "billing-service",
    "type": "invoice.paid",
    "occurredAt": "2026-07-20T10:15:00Z",
    "payload": { "amount": 4200, "currency": "USD" }
  }'</code></pre>
    </div>
  </section>
</template>

<style scoped>
.docs-page {
  min-height: 100vh;
  padding: 32px;
  display: grid;
  gap: 24px;
  max-width: 900px;
}

.docs-card {
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 32px;
  background: rgba(255, 250, 242, 0.82);
  box-shadow: var(--shadow);
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--accent-strong);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
}

h1,
h2 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-display);
}

.intro {
  margin: 16px 0 0;
  color: var(--muted);
  max-width: 68ch;
}

code {
  background: rgba(29, 27, 23, 0.06);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 0.92em;
}

.code-block {
  margin: 20px 0 0;
  padding: 18px;
  border-radius: 16px;
  background: rgba(29, 27, 23, 0.92);
  color: #f3ede1;
  overflow-x: auto;
}

.code-block code {
  background: none;
  padding: 0;
  color: inherit;
}

.table-panel {
  margin-top: 20px;
  overflow-x: auto;
}

.fields-table {
  width: 100%;
  border-collapse: collapse;
}

.fields-table th,
.fields-table td {
  padding: 14px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(29, 27, 23, 0.08);
  vertical-align: top;
}

.fields-table th {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

@media (max-width: 900px) {
  .docs-page {
    padding: 20px;
  }

  .docs-card {
    padding: 24px;
  }
}
</style>
