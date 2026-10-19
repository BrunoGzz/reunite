// Calls every API route with no session, a volunteer session and a coordinator session,
// and checks the exact status code. A route that is not in the table fails the test.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.REUNITE_DB = ':memory:'
process.env.OPENAI_API_KEY = '' // voice stays "not configured" and never calls out
process.env.ANTHROPIC_API_KEY = ''
const { default: db } = await import('./db.js')
const { createApp, routers } = await import('./app.js')
const { seed } = await import('./seed.js')
seed()

const server = createApp().listen(0)
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

const json = { 'content-type': 'application/json' }

async function login(role, shelterId = 1, origin = base, extra = {}) {
  const password = process.env.DEMO_PASSWORD || 'dali2026'
  return fetch(`${origin}/api/login`, { method: 'POST', headers: { ...json, ...extra }, body: JSON.stringify({ shelterId, role, password }) })
}

async function call(row, who) {
  const headers = { ...json }
  if (who !== 'none') headers.cookie = (await login(who)).headers.getSetCookie()[0].split(';')[0]
  const body = row.body === undefined ? undefined : JSON.stringify(row.body)
  return fetch(base + '/api' + row.url, { method: row.method, headers, body })
}

// none / volunteer / coordinator are the expected status codes.
const MISSING = 999999
const ROWS = [
  { method: 'GET', pattern: '/shelters', url: '/shelters', none: 200, volunteer: 200, coordinator: 200 },
  { method: 'POST', pattern: '/login', url: '/login', body: {}, none: 400, volunteer: 400, coordinator: 400 },
  { method: 'POST', pattern: '/logout', url: '/logout', none: 200, volunteer: 200, coordinator: 200 },
  { method: 'GET', pattern: '/me', url: '/me', none: 401, volunteer: 200, coordinator: 200 },
  { method: 'GET', pattern: '/people', url: '/people', none: 401, volunteer: 200, coordinator: 200 },
  { method: 'POST', pattern: '/people', url: '/people', body: { name: 'Route Test', sex: 'male', age: 40 }, none: 401, volunteer: 200, coordinator: 200 },
  { method: 'POST', pattern: '/people/:id/status', url: `/people/${MISSING}/status`, body: { status: 'left' }, none: 401, volunteer: 404, coordinator: 404 },
  { method: 'GET', pattern: '/places', url: '/places?q=lin', none: 401, volunteer: 200, coordinator: 200 },
  { method: 'POST', pattern: '/searches', url: '/searches', body: {}, none: 401, volunteer: 400, coordinator: 400 },
  { method: 'GET', pattern: '/searches', url: '/searches', none: 401, volunteer: 200, coordinator: 200 },
  { method: 'GET', pattern: '/searches/:id', url: `/searches/${MISSING}`, none: 401, volunteer: 404, coordinator: 404 },
  { method: 'POST', pattern: '/matches/:id/request', url: `/matches/${MISSING}/request`, body: {}, none: 401, volunteer: 404, coordinator: 404 },
  { method: 'GET', pattern: '/requests', url: '/requests', none: 401, volunteer: 200, coordinator: 200 },
  { method: 'POST', pattern: '/requests/:id/decide', url: `/requests/${MISSING}/decide`, body: { decision: 'accept' }, none: 401, volunteer: 404, coordinator: 404 },
  { method: 'GET', pattern: '/photos/:id', url: `/photos/${MISSING}`, none: 401, volunteer: 404, coordinator: 404 },
  { method: 'GET', pattern: '/dashboard', url: '/dashboard', none: 401, volunteer: 200, coordinator: 200 },
  { method: 'POST', pattern: '/notifications/:id/read', url: `/notifications/${MISSING}/read`, body: {}, none: 401, volunteer: 404, coordinator: 404 },
  { method: 'GET', pattern: '/coordinator/queue', url: '/coordinator/queue', none: 401, volunteer: 403, coordinator: 200 },
  { method: 'POST', pattern: '/coordinator/matches/:id/approve', url: `/coordinator/matches/${MISSING}/approve`, body: {}, none: 401, volunteer: 403, coordinator: 404 },
  { method: 'POST', pattern: '/coordinator/matches/:id/reject', url: `/coordinator/matches/${MISSING}/reject`, body: {}, none: 401, volunteer: 403, coordinator: 404 },
  { method: 'GET', pattern: '/coordinator/movements', url: '/coordinator/movements', none: 401, volunteer: 403, coordinator: 200 },
  { method: 'POST', pattern: '/coordinator/movements', url: '/coordinator/movements', body: {}, none: 401, volunteer: 403, coordinator: 400 },
  { method: 'GET', pattern: '/voice/status', url: '/voice/status', none: 401, volunteer: 200, coordinator: 200 },
  { method: 'POST', pattern: '/voice', url: '/voice', body: {}, none: 401, volunteer: 503, coordinator: 503 },
  // These change data, so they run last.
  { method: 'POST', pattern: '/coordinator/demo/late-arrival', url: '/coordinator/demo/late-arrival', body: {}, none: 401, volunteer: 403, coordinator: 200 },
  { method: 'POST', pattern: '/coordinator/demo/reset', url: '/coordinator/demo/reset', body: {}, none: 401, volunteer: 403, coordinator: 200 },
]

test('every registered route is in the table', () => {
  const registered = []
  for (const router of Object.values(routers)) {
    for (const layer of router.stack) {
      if (layer.route) for (const method of Object.keys(layer.route.methods)) registered.push(`${method.toUpperCase()} ${layer.route.path}`)
    }
  }
  const listed = ROWS.map((r) => `${r.method} ${r.pattern}`)
  assert.deepEqual(registered.sort(), listed.sort())
})

test('notifications can only be marked read by their own shelter or the coordinator', async () => {
  const forShelter2 = db.prepare('SELECT id FROM notifications WHERE shelter_id = 2 AND is_read = 0').get().id
  const forCoordinator = db.prepare('SELECT id FROM notifications WHERE shelter_id IS NULL AND is_read = 0').get().id
  const cookie = async (role, shelter) => (await login(role, shelter)).headers.getSetCookie()[0].split(';')[0]
  const mark = async (id, who) => (await fetch(`${base}/api/notifications/${id}/read`, { method: 'POST', headers: { cookie: who } })).status

  assert.equal(await mark(forShelter2, await cookie('volunteer', 1)), 404) // another shelter
  assert.equal(await mark(forCoordinator, await cookie('volunteer', 1)), 404) // coordinator-only alert
  assert.equal(await mark(forShelter2, await cookie('coordinator', 1)), 404) // coordinators do not own shelter alerts
  assert.equal(await mark(forCoordinator, await cookie('coordinator', 1)), 200)
  assert.equal(await mark(forShelter2, await cookie('volunteer', 2)), 200)
})

for (const row of ROWS) {
  test(`${row.method} ${row.pattern}`, async () => {
    for (const who of ['none', 'volunteer', 'coordinator']) {
      const res = await call(row, who)
      assert.equal(res.status, row[who], `${who} got ${res.status}, expected ${row[who]}`)
    }
  })
}

test('API responses are never cached and carry security headers', async () => {
  const res = await fetch(`${base}/api/shelters`)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('x-powered-by'), null)
})

test('in production the session cookie is secure, httpOnly and sameSite=lax, and needs the proxy header', async () => {
  const before = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const prod = createApp().listen(0)
  process.env.NODE_ENV = before
  try {
    const origin = `http://127.0.0.1:${prod.address().port}`
    const viaProxy = await login('volunteer', 1, origin, { 'x-forwarded-proto': 'https' })
    const cookie = viaProxy.headers.getSetCookie()[0]
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /Secure/i)
    assert.match(cookie, /SameSite=Lax/i)
    const direct = await login('volunteer', 1, origin) // plain http, no proxy header
    assert.equal(direct.headers.getSetCookie().length, 0)
  } finally {
    prod.close()
  }
})
