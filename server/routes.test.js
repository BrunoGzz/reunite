// Calls every API route with no session and with a session, and checks the exact status code.
// A route that is not in the table fails the test.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

process.env.REUNITE_DB = ':memory:'
process.env.OPENAI_API_KEY = '' // voice stays "not configured" and never calls out
process.env.DEEPSEEK_API_KEY = ''
const { default: db, photoDir } = await import('./db.js')
const { createApp, routers } = await import('./app.js')
const { seed } = await import('./seed.js')
const engine = await import('./engine.js')
seed()

const server = createApp().listen(0)
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

const json = { 'content-type': 'application/json' }

// There is no login: a client just chooses which shelter the session acts as.
async function startSession(shelterId = 1, origin = base, extra = {}) {
  return fetch(`${origin}/api/session`, { method: 'POST', headers: { ...json, ...extra }, body: JSON.stringify({ shelterId }) })
}
const cookieFor = async (shelter) => (await startSession(shelter)).headers.getSetCookie()[0].split(';')[0]
const api = async (cookie, method, url, body) => {
  const res = await fetch(`${base}/api${url}`, { method, headers: { ...json, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// none / session are the expected status codes without and with a session.
const MISSING = 999999
const ROWS = [
  { method: 'GET', pattern: '/shelters', url: '/shelters', none: 200, session: 200 },
  { method: 'POST', pattern: '/session', url: '/session', body: {}, none: 400, session: 400 },
  { method: 'GET', pattern: '/me', url: '/me', none: 401, session: 200 },
  { method: 'GET', pattern: '/people', url: '/people', none: 401, session: 200 },
  { method: 'POST', pattern: '/people', url: '/people', body: { name: 'Route Test', sex: 'male', age: 40 }, none: 401, session: 200 },
  { method: 'GET', pattern: '/places', url: '/places?q=lin', none: 401, session: 200 },
  { method: 'POST', pattern: '/searches', url: '/searches', body: {}, none: 401, session: 400 },
  { method: 'GET', pattern: '/searches', url: '/searches', none: 401, session: 200 },
  { method: 'GET', pattern: '/searches/:id', url: `/searches/${MISSING}`, none: 401, session: 404 },
  { method: 'POST', pattern: '/matches/:id/request', url: `/matches/${MISSING}/request`, body: {}, none: 401, session: 404 },
  { method: 'GET', pattern: '/requests', url: '/requests', none: 401, session: 200 },
  { method: 'POST', pattern: '/requests/:id/decide', url: `/requests/${MISSING}/decide`, body: { decision: 'accept' }, none: 401, session: 404 },
  { method: 'GET', pattern: '/photos/:id', url: `/photos/${MISSING}`, none: 401, session: 404 },
  { method: 'GET', pattern: '/attention', url: '/attention', none: 401, session: 200 },
  { method: 'POST', pattern: '/notifications/:id/read', url: `/notifications/${MISSING}/read`, body: {}, none: 401, session: 404 },
  { method: 'GET', pattern: '/review', url: '/review', none: 401, session: 200 },
  { method: 'POST', pattern: '/review/matches/:id/approve', url: `/review/matches/${MISSING}/approve`, body: {}, none: 401, session: 404 },
  { method: 'POST', pattern: '/review/matches/:id/reject', url: `/review/matches/${MISSING}/reject`, body: {}, none: 401, session: 404 },
  { method: 'GET', pattern: '/voice/status', url: '/voice/status', none: 401, session: 200 },
  { method: 'POST', pattern: '/voice', url: '/voice', body: {}, none: 401, session: 503 },
  // These change data, so they run last.
  { method: 'POST', pattern: '/demo/late-arrival', url: '/demo/late-arrival', body: {}, none: 401, session: 200 },
  { method: 'POST', pattern: '/demo/reset', url: '/demo/reset', body: {}, none: 401, session: 200 },
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

test('choosing a shelter needs no password and rejects nonsense; there is no role', async () => {
  const ok = await api(null, 'POST', '/session', { shelterId: 2, role: 'coordinator' }) // any role field is ignored
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.body, { shelterId: 2, shelterName: "St. Mary's Community Center" })
  assert.equal((await api(null, 'POST', '/session', { shelterId: MISSING })).status, 400)
  assert.equal((await api(null, 'POST', '/session', {})).status, 400)
})

test('the session remembers the chosen shelter and can be switched', async () => {
  const cookie = await cookieFor(1)
  assert.deepEqual((await api(cookie, 'GET', '/me')).body, { shelterId: 1, shelterName: 'Riverside High School Shelter' })
  await api(cookie, 'POST', '/session', { shelterId: 3 })
  assert.deepEqual((await api(cookie, 'GET', '/me')).body, { shelterId: 3, shelterName: 'Harbor View Hotel (emergency housing)' })
})

test('alerts can only be marked read by their own shelter', async () => {
  const forShelter2 = db.prepare("SELECT id FROM notifications WHERE shelter_id = 2 AND kind = 'match_alert' AND is_read = 0").get().id
  assert.equal((await api(await cookieFor(1), 'POST', `/notifications/${forShelter2}/read`)).status, 404)
  assert.equal((await api(await cookieFor(2), 'POST', `/notifications/${forShelter2}/read`)).status, 200)
})

test('open searches list: own shelter only, best score, and a sent request always reads as pending', async () => {
  const river = await cookieFor(1)
  const searches = (await api(river, 'GET', '/searches')).body
  const rosa = searches.find((x) => x.name === 'Rosa Delgado')
  assert.equal(rosa.searcher_name, 'Elena Delgado')
  assert.ok(rosa.best_score >= 85 && rosa.match_count >= 1)
  assert.equal(rosa.request_sent, false)
  assert.ok(!searches.some((x) => x.name === 'Daniel Reyes')) // that one belongs to St. Mary's
  assert.ok((await api(await cookieFor(2), 'GET', '/searches')).body.some((x) => x.name === 'Daniel Reyes'))

  // The seed has a request waiting for Maria Santos. Declining it must not change what the searcher sees.
  assert.equal(searches.find((x) => x.name === 'Maria Santos').request_sent, true)
  db.prepare("UPDATE contact_requests SET status = 'declined'").run()
  const afterDecline = (await api(river, 'GET', '/searches')).body
  assert.equal(afterDecline.find((x) => x.name === 'Maria Santos').request_sent, true)
  assert.ok(!JSON.stringify(afterDecline).toLowerCase().includes('declin'))

  // A search nobody matches has no best score.
  const elena = db.prepare("SELECT id FROM people WHERE name = 'Elena Delgado'").get().id
  engine.addSearch({ shelterId: 1, searcherPersonId: elena, target: { name: 'Zzyzx Qwerty', sex: 'male', age: 90 } })
  const lonely = (await api(river, 'GET', '/searches')).body.find((x) => x.name === 'Zzyzx Qwerty')
  assert.equal(lonely.best_score, null)
  assert.equal(lonely.match_count, 0)
  assert.equal(lonely.request_sent, false)
})

test('Needs review: any shelter sees the queue, without the registered person\'s shelter, and approving alerts the searcher', async () => {
  const harbor = await cookieFor(3)
  const queue = (await api(harbor, 'GET', '/review')).body
  assert.equal(queue.matches.length, 1) // the nameless child from the seed
  const item = queue.matches[0]
  assert.equal(item.sought_name, 'Daniel Reyes')
  assert.equal(item.person_name, null)
  assert.equal(item.person_place, 'Lincoln Elementary')
  assert.ok(!JSON.stringify(item).includes('shelter'), 'the review queue must not reveal where the registered person is')
  assert.equal((await api(harbor, 'GET', '/attention')).body.reviewCount, 1)

  const marys = await cookieFor(2) // the mother's shelter has no alert yet
  assert.ok(!(await api(marys, 'GET', '/attention')).body.alerts.some((a) => a.text.includes('Daniel Reyes')))
  assert.equal((await api(harbor, 'POST', `/review/matches/${item.id}/approve`)).status, 200) // approved by a different shelter
  assert.ok((await api(marys, 'GET', '/attention')).body.alerts.some((a) => a.text.includes('Daniel Reyes')))
  assert.equal((await api(harbor, 'GET', '/review')).body.matches.length, 0)
  assert.equal((await api(harbor, 'POST', `/review/matches/${item.id}/approve`)).status, 404) // nothing left to approve
})

test('Needs review: requests for people who need help deciding are decided by anyone, and are not in Requests', async () => {
  const river = await cookieFor(1)
  const rosaSearch = db.prepare("SELECT id FROM searches WHERE name = 'Rosa Delgado'").get().id
  const match = db.prepare('SELECT * FROM matches WHERE search_id = ?').get(rosaSearch)
  const id = engine.createRequest({ match, message: 'Mom, it is Elena', photo: null })
  assert.equal(db.prepare('SELECT routed_to FROM contact_requests WHERE id = ?').get(id).routed_to, 'review')

  // Rosa lives at Harbor, but the request is not in Harbor's Requests, and it is in everyone's review queue.
  assert.equal((await api(await cookieFor(3), 'GET', '/requests')).body.incoming.length, 0)
  const queue = (await api(river, 'GET', '/review')).body
  assert.equal(queue.requests.length, 1)
  assert.equal(queue.requests[0].person_name, 'Rosa Delgado')
  assert.equal(queue.requests[0].needs_assistance, 1)
  assert.equal((await api(river, 'GET', '/attention')).body.reviewCount, 1)

  // A shelter's own request is another matter: only the receiving shelter may see its photo.
  const shelterRequest = db.prepare("SELECT id FROM contact_requests WHERE routed_to = 'shelter' LIMIT 1").get().id
  const originalStatus = db.prepare('SELECT status FROM contact_requests WHERE id = ?').get(shelterRequest).status
  const file = 'test-photo-' + Date.now()
  fs.writeFileSync(path.join(photoDir, file), 'x')
  try {
    db.prepare("UPDATE contact_requests SET photo_file = ?, status = 'pending' WHERE id = ?").run(file, shelterRequest)
    const target = db.prepare('SELECT to_shelter_id AS s FROM contact_requests WHERE id = ?').get(shelterRequest).s
    const other = target === 1 ? 2 : 1
    const photo = async (shelter) => (await fetch(`${base}/api/photos/${shelterRequest}`, { headers: { cookie: await cookieFor(shelter) } })).status
    assert.equal(await photo(target), 200)
    assert.equal(await photo(other), 403)
    db.prepare("UPDATE contact_requests SET photo_file = ? WHERE id = ?").run(file, id)
    assert.equal((await fetch(`${base}/api/photos/${id}`, { headers: { cookie: await cookieFor(other) } })).status, 200) // review request: anyone
  } finally {
    fs.rmSync(path.join(photoDir, file), { force: true })
    db.prepare('UPDATE contact_requests SET photo_file = NULL').run()
    db.prepare('UPDATE contact_requests SET status = ? WHERE id = ?').run(originalStatus, shelterRequest)
  }

  const decided = await api(await cookieFor(2), 'POST', `/requests/${id}/decide`, { decision: 'accept' })
  assert.equal(decided.status, 200)
  assert.equal(decided.body.reunion.person_name, 'Elena Delgado')
  assert.equal((await api(river, 'GET', '/review')).body.requests.length, 0)
})

test('attention: alerts and waiting requests are for this shelter only', async () => {
  const harbor = (await api(await cookieFor(3), 'GET', '/attention')).body
  assert.equal(harbor.pendingRequests, 0) // Maria's request was declined above
  const river = (await api(await cookieFor(1), 'GET', '/attention')).body
  assert.ok(river.alerts.length >= 1)
  assert.ok(river.alerts.every((a) => ['match_alert', 'reunion'].includes(a.kind)))
  assert.equal((await api(await cookieFor(1), 'GET', '/attention')).body.emails.length, 0)
})

test('read alerts move to Earlier instead of disappearing, and match alerts name the searcher', async () => {
  const river = await cookieFor(1)
  const before = (await api(river, 'GET', '/attention')).body
  const rosa = before.alerts.find((a) => a.text.includes('Rosa Delgado'))
  assert.equal(rosa.searcher_name, 'Elena Delgado')
  assert.ok(rosa.search_id)
  assert.ok(!before.earlier.some((a) => a.id === rosa.id))

  assert.equal((await api(river, 'POST', `/notifications/${rosa.id}/read`)).status, 200)
  const after = (await api(river, 'GET', '/attention')).body
  assert.ok(!after.alerts.some((a) => a.id === rosa.id)) // no longer new, so it no longer counts
  const kept = after.earlier.find((a) => a.id === rosa.id)
  assert.equal(kept.text, rosa.text)
  assert.equal(kept.search_id, rosa.search_id) // still possible to view its results
  assert.equal(kept.searcher_name, 'Elena Delgado')
  assert.ok(!(await api(await cookieFor(2), 'GET', '/attention')).body.earlier.some((a) => a.id === rosa.id)) // other shelters never see it

  // Only the 20 most recent read alerts are kept.
  const match = db.prepare('SELECT id FROM matches LIMIT 1').get().id
  for (let i = 0; i < 25; i++) engine.notify({ shelterId: 1, kind: 'match_alert', text: `Old alert ${i}`, matchId: match })
  db.prepare("UPDATE notifications SET is_read = 1 WHERE shelter_id = 1 AND text LIKE 'Old alert %'").run()
  const many = (await api(river, 'GET', '/attention')).body
  assert.equal(many.earlier.length, 20)
  assert.equal(many.alerts.length, before.alerts.length - 1)
})

for (const row of ROWS) {
  test(`${row.method} ${row.pattern}`, async () => {
    for (const who of ['none', 'session']) {
      const res = await api(who === 'none' ? null : await cookieFor(1), row.method, row.url, row.body)
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
    const viaProxy = await startSession(1, origin, { 'x-forwarded-proto': 'https' })
    const cookie = viaProxy.headers.getSetCookie()[0]
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /Secure/i)
    assert.match(cookie, /SameSite=Lax/i)
    const direct = await startSession(1, origin) // plain http, no proxy header
    assert.equal(direct.headers.getSetCookie().length, 0)
  } finally {
    prod.close()
  }
})
