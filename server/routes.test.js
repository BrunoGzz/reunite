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
  { method: 'POST', pattern: '/searches/:id/seen', url: `/searches/${MISSING}/seen`, body: {}, none: 401, session: 404 },
  { method: 'POST', pattern: '/matches/:id/request', url: `/matches/${MISSING}/request`, body: {}, none: 401, session: 404 },
  { method: 'GET', pattern: '/incoming', url: '/incoming', none: 401, session: 200 },
  { method: 'POST', pattern: '/requests/:id/decide', url: `/requests/${MISSING}/decide`, body: { decision: 'accept' }, none: 401, session: 404 },
  { method: 'GET', pattern: '/photos/:id', url: `/photos/${MISSING}`, none: 401, session: 404 },
  { method: 'GET', pattern: '/badges', url: '/badges', none: 401, session: 200 },
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

const cards = async (shelter) => (await api(await cookieFor(shelter), 'GET', '/searches')).body
const badges = async (shelter) => (await api(await cookieFor(shelter), 'GET', '/badges')).body

test('Our searches: one card per search from this shelter, with new activity first', async () => {
  const list = await cards(1)
  assert.deepEqual(list.map((c) => c.name).sort(), ['Maria Santos', 'Rosa Delgado', 'Tanya Hill', 'Tomas Ferrer'])
  assert.ok(!list.some((c) => c.name === 'Daniel Reyes')) // that one belongs to St. Mary's
  assert.ok((await cards(2)).some((c) => c.name === 'Daniel Reyes'))

  const rosa = list.find((c) => c.name === 'Rosa Delgado')
  assert.equal(rosa.searcher_name, 'Elena Delgado')
  assert.equal(rosa.status, 'open')
  assert.ok(rosa.best_score >= 85 && rosa.match_count >= 1)
  assert.equal(rosa.request_sent, false)
  assert.equal(rosa.reunion, null)
  assert.equal(rosa.new_activity, true) // the seed raised an alert for it

  const tomas = list.find((c) => c.name === 'Tomas Ferrer') // found by marks and place only: a possible match, no alert
  assert.ok(tomas.match_count >= 1 && tomas.best_score < 85)
  assert.equal(tomas.new_activity, false)
  assert.equal(list.at(-1).name, 'Tomas Ferrer') // cards without new activity come last
  assert.ok(list.slice(0, -1).every((c) => c.new_activity))
})

test('Our searches: opening a search clears its highlight and the sidebar count, for its own shelter only', async () => {
  const river = await cookieFor(1)
  const rosaId = (await cards(1)).find((c) => c.name === 'Rosa Delgado').id
  const before = (await badges(1)).searches
  assert.equal((await api(await cookieFor(2), 'POST', `/searches/${rosaId}/seen`)).status, 404) // not their search
  assert.equal((await cards(1)).find((c) => c.id === rosaId).new_activity, true)

  assert.equal((await api(river, 'POST', `/searches/${rosaId}/seen`)).status, 200)
  assert.equal((await cards(1)).find((c) => c.id === rosaId).new_activity, false)
  assert.equal((await badges(1)).searches, before - 1)
})

test('Our searches: a sent request always reads as sent, even after a decline, and an unmatched search has no score', async () => {
  const maria = (await cards(1)).find((c) => c.name === 'Maria Santos') // the seed has a request waiting
  assert.equal(maria.request_sent, true)
  db.prepare("UPDATE contact_requests SET status = 'declined'").run()
  const afterDecline = await cards(1)
  assert.equal(afterDecline.find((c) => c.name === 'Maria Santos').request_sent, true)
  assert.ok(!JSON.stringify(afterDecline).toLowerCase().includes('declin'))

  const elena = db.prepare("SELECT id FROM people WHERE name = 'Elena Delgado'").get().id
  engine.addSearch({ shelterId: 1, searcherPersonId: elena, target: { name: 'Zzyzx Qwerty', sex: 'male', age: 90 } })
  const lonely = (await cards(1)).find((c) => c.name === 'Zzyzx Qwerty')
  assert.equal(lonely.best_score, null)
  assert.equal(lonely.match_count, 0)
  assert.equal(lonely.request_sent, false)
})

test('Our searches: the card holds the reunion, with the location and the simulated email', async () => {
  const harbor = await cookieFor(3)
  const item = (await api(harbor, 'GET', '/review')).body.matches[0] // the nameless child, found for Carla at St. Mary's
  assert.equal((await api(harbor, 'POST', `/review/matches/${item.id}/approve`)).status, 200)
  const marys = await cookieFor(2)
  const child = (await cards(2)).find((c) => c.name === 'Daniel Reyes')
  assert.equal(child.new_activity, true) // approving raised an alert for the mother's search

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(item.id)
  const id = engine.createRequest({ match, message: 'Daniel, I am here', photo: null })
  assert.equal((await api(harbor, 'POST', `/requests/${id}/decide`, { decision: 'accept' })).status, 200)

  const reunited = (await cards(2)).find((c) => c.name === 'Daniel Reyes')
  assert.equal(reunited.status, 'closed')
  assert.equal(reunited.reunion.shelter.name, 'Riverside High School Shelter')
  assert.ok(reunited.reunion.shelter.address && reunited.reunion.shelter.phone && reunited.reunion.shelter.instructions)
  assert.equal(reunited.email, 'Email sent to carla.reyes@example.com')
  assert.equal(reunited.new_activity, true) // until she opens it
  await api(marys, 'POST', `/searches/${reunited.id}/seen`)
  assert.equal((await cards(2)).find((c) => c.name === 'Daniel Reyes').new_activity, false)
})

test('Looking for people here: waiting and accepted requests for this shelter only; declined ones never show', async () => {
  const none = (await api(await cookieFor(3), 'GET', '/incoming')).body
  assert.equal(none.pending.length, 0) // Maria's request was declined above
  assert.equal(none.accepted.length, 0)

  // A request for Lena (St. Mary's), sent by Riverside, then accepted.
  const lena = engine.addPerson({ name: 'Lena Fox', sex: 'female', age: 33, last_place: 'Cedar Park Homes' }, 2)
  const sam = engine.addPerson({ name: 'Sam Fox', sex: 'male', age: 35 }, 1)
  const search = engine.addSearch({ shelterId: 1, searcherPersonId: sam.id, target: { name: 'Lena Fox', sex: 'female', age: 33, last_place: 'Cedar Park Homes' } })
  engine.runSearch(search)
  const match = db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(search.id, lena.id)
  const id = engine.createRequest({ match, message: 'Lena, it is Sam', photo: null })

  const marys = await cookieFor(2)
  const waiting = (await api(marys, 'GET', '/incoming')).body
  assert.equal(waiting.pending.length, 1)
  assert.equal(waiting.pending[0].person_name, 'Lena Fox')
  assert.equal(waiting.pending[0].searcher_name, 'Sam Fox')
  assert.equal(waiting.pending[0].message, 'Lena, it is Sam')
  assert.equal((await badges(2)).incoming, 1)
  assert.equal((await api(await cookieFor(1), 'GET', '/incoming')).body.pending.length, 0) // not Riverside's to decide
  assert.equal((await api(await cookieFor(1), 'POST', `/requests/${id}/decide`, { decision: 'accept' })).status, 403)

  assert.equal((await api(marys, 'POST', `/requests/${id}/decide`, { decision: 'accept' })).status, 200)
  const after = (await api(marys, 'GET', '/incoming')).body
  assert.equal(after.pending.length, 0)
  assert.equal(after.accepted.length, 1)
  assert.equal(after.accepted[0].reunion.shelter.name, 'Riverside High School Shelter') // where the family is
  assert.equal((await badges(2)).incoming, 0)

  // A declined request, and one dropped after that decline, are both stored as declined and never listed.
  const decline = engine.addSearch({ shelterId: 1, searcherPersonId: sam.id, target: { name: 'Lena Fox', sex: 'female', age: 33, last_place: 'Cedar Park Homes' } })
  engine.runSearch(decline)
  assert.equal((await api(marys, 'GET', '/incoming')).body.accepted.length, 1)
  db.prepare("UPDATE contact_requests SET status = 'declined' WHERE status = 'accepted'").run()
  assert.equal(JSON.stringify((await api(marys, 'GET', '/incoming')).body).includes('Lena'), false)
})

test('Needs review: other shelters see a request for someone who needs help deciding, but the sender never does', async () => {
  const harbor = await cookieFor(3), marys = await cookieFor(2), river = await cookieFor(1)
  const queue = (await api(harbor, 'GET', '/review')).body
  assert.equal(queue.requests.length, 0)
  assert.equal(queue.matches.length, 0) // the child was approved above

  // Rosa needs assistance, so Riverside's request for her goes to review, not to Harbor's own list.
  const rosaSearch = db.prepare("SELECT id FROM searches WHERE name = 'Rosa Delgado'").get().id
  const match = db.prepare('SELECT * FROM matches WHERE search_id = ?').get(rosaSearch)
  const id = engine.createRequest({ match, message: 'Mom, it is Elena', photo: null })
  assert.equal(db.prepare('SELECT routed_to FROM contact_requests WHERE id = ?').get(id).routed_to, 'review')
  const countBefore = (await badges(2)).review

  // Everyone except the sender sees it, and nobody sees where anyone is.
  for (const [shelter, cookie, here] of [[3, harbor, true], [2, marys, false]]) {
    const filled = (await api(cookie, 'GET', '/review')).body
    assert.equal(filled.requests.length, 1, `shelter ${shelter} should see it`)
    assert.equal(filled.requests[0].person_name, 'Rosa Delgado')
    assert.equal(filled.requests[0].needs_assistance, 1)
    assert.equal(filled.requests[0].person_here, here) // Rosa is at Harbor
    assert.equal(filled.requests[0].sender_here, false)
    assert.ok(!JSON.stringify(filled).includes('shelter'), 'the review queue must not reveal where anyone is')
  }
  assert.equal((await api(harbor, 'GET', '/incoming')).body.pending.length, 0)

  // The sender (Riverside) does not see it in the queue or in the count, and can neither decide it nor see its photo.
  assert.equal((await api(river, 'GET', '/review')).body.requests.length, 0)
  assert.equal((await badges(1)).review, 0)
  assert.equal((await badges(2)).review, countBefore)
  const file = 'test-photo-' + Date.now()
  fs.writeFileSync(path.join(photoDir, file), 'x')
  try {
    db.prepare('UPDATE contact_requests SET photo_file = ? WHERE id = ?').run(file, id)
    const photo = async (cookie) => (await fetch(`${base}/api/photos/${id}`, { headers: { cookie } })).status
    assert.equal(await photo(marys), 200)
    assert.equal(await photo(river), 403)
  } finally {
    fs.rmSync(path.join(photoDir, file), { force: true })
    db.prepare('UPDATE contact_requests SET photo_file = NULL').run()
  }
  const refused = await api(river, 'POST', `/requests/${id}/decide`, { decision: 'accept' })
  assert.equal(refused.status, 403)
  assert.equal(db.prepare('SELECT status FROM contact_requests WHERE id = ?').get(id).status, 'pending') // nothing happened
  assert.equal((await api(river, 'POST', `/requests/${id}/decide`, { decision: 'decline' })).status, 403)

  const decided = await api(marys, 'POST', `/requests/${id}/decide`, { decision: 'accept' }) // another shelter may
  assert.equal(decided.status, 200)
  assert.equal(decided.body.reunion.person_name, 'Elena Delgado')
  assert.equal((await badges(2)).review, countBefore - 1)
})

test('a shelter can never decide a request it sent, even one meant for another shelter\'s own list', async () => {
  const lena = engine.addPerson({ name: 'Rita Gómez', sex: 'female', age: 40, last_place: 'Oak Ridge Apartments' }, 3)
  const sam = engine.addPerson({ name: 'Leo Gómez', sex: 'male', age: 42 }, 1)
  const search = engine.addSearch({ shelterId: 1, searcherPersonId: sam.id, target: { name: 'Rita Gómez', sex: 'female', age: 40, last_place: 'Oak Ridge Apartments' } })
  engine.runSearch(search)
  const match = db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(search.id, lena.id)
  const id = engine.createRequest({ match, message: 'Rita, it is Leo', photo: null })
  assert.equal(db.prepare('SELECT routed_to FROM contact_requests WHERE id = ?').get(id).routed_to, 'shelter')
  assert.equal((await api(await cookieFor(1), 'POST', `/requests/${id}/decide`, { decision: 'accept' })).status, 403) // the sender
  assert.equal((await api(await cookieFor(2), 'POST', `/requests/${id}/decide`, { decision: 'accept' })).status, 403) // a third shelter
  assert.equal((await api(await cookieFor(3), 'POST', `/requests/${id}/decide`, { decision: 'decline' })).status, 200) // the person's shelter
})

test('the sender and the found person at the same shelter: shown in both places, and decided there', async () => {
  const river = await cookieFor(1)
  const ana = engine.addPerson({ name: 'Ana Pérez', sex: 'female', age: 29 }, 1)
  const juan = engine.addPerson({ name: 'Juan Pérez', sex: 'male', age: 31, last_place: 'Cedar Park Homes' }, 1)
  const search = engine.addSearch({ shelterId: 1, searcherPersonId: ana.id, target: { name: 'Juan Pérez', sex: 'male', age: 31, last_place: 'Cedar Park Homes' } })
  engine.runSearch(search)
  const match = db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(search.id, juan.id)
  const id = engine.createRequest({ match, message: 'Juan, it is Ana', photo: null })

  // Our searches: the card says the person is also here, and the request reads as sent.
  const card = (await cards(1)).find((c) => c.id === search.id)
  assert.equal(card.also_here, true)
  assert.equal(card.request_sent, true)
  // Looking for people here: the same request, with the sender marked, and it can be decided there.
  const waiting = (await api(river, 'GET', '/incoming')).body.pending.find((r) => r.id === id)
  assert.equal(waiting.sender_here, true)
  assert.equal(waiting.searcher_name, 'Ana Pérez')
  assert.equal(waiting.person_name, 'Juan Pérez')
  assert.ok(!('from_shelter_id' in waiting), 'a pending request does not carry the sender\'s shelter')
  assert.equal((await api(river, 'POST', `/requests/${id}/decide`, { decision: 'accept' })).status, 200)

  // A shelter other than the person's has no card for it. Someone elsewhere is not marked "also here".
  assert.equal((await cards(2)).some((c) => c.also_here), false)

  // The same holds for the review queue: a request for someone who needs help deciding, at the sender's own shelter.
  const marta = engine.addPerson({ name: 'Marta Ruiz', sex: 'female', age: 85, needs_assistance: true, last_place: 'Sunrise Care Home' }, 1)
  const hija = engine.addPerson({ name: 'Lucía Ruiz', sex: 'female', age: 55 }, 1)
  const s2 = engine.addSearch({ shelterId: 1, searcherPersonId: hija.id, target: { name: 'Marta Ruiz', sex: 'female', age: 85, last_place: 'Sunrise Care Home' } })
  engine.runSearch(s2)
  const m2 = db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(s2.id, marta.id)
  const id2 = engine.createRequest({ match: m2, message: 'Mamá', photo: null })
  assert.equal(db.prepare('SELECT routed_to FROM contact_requests WHERE id = ?').get(id2).routed_to, 'review')
  const mine = (await api(river, 'GET', '/review')).body.requests.find((r) => r.id === id2)
  assert.equal(mine.sender_here, true)
  assert.equal(mine.person_here, true)
  assert.equal((await api(river, 'POST', `/requests/${id2}/decide`, { decision: 'decline' })).status, 200)
})

test('badges: each sidebar count is for this shelter, except the review queue', async () => {
  const b = await badges(1)
  assert.deepEqual(Object.keys(b).sort(), ['incoming', 'people', 'review', 'searches'])
  assert.equal(b.people, db.prepare('SELECT COUNT(*) AS n FROM people WHERE shelter_id = 1').get().n)
  assert.notEqual(b.people, (await badges(2)).people)
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
