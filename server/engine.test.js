import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.REUNITE_DB = ':memory:'
process.env.REUNITE_PHOTOS = fs.mkdtempSync(path.join(os.tmpdir(), 'reunite-photos-')) // never the real photo folder
const { default: db, photoDir } = await import('./db.js')
const engine = await import('./engine.js')
const { seed } = await import('./seed.js')
seed()

const person = (name) => db.prepare('SELECT * FROM people WHERE name = ?').get(name)
const searchFor = (searcherName) => db.prepare('SELECT * FROM searches WHERE searcher_person_id = ?').get(person(searcherName).id)
const matchFor = (search, targetName) => db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(search.id, person(targetName).id)
const photoCount = () => fs.readdirSync(photoDir).filter((f) => f !== '.gitkeep').length

test('no photo needed when both searches score 85 or more', () => {
  const match = matchFor(searchFor('Marcus Hill'), 'Tanya Hill')
  assert.equal(engine.isReciprocal(match), true)
  assert.equal(engine.resultCard(match).reciprocal, true)
  assert.equal(engine.needsPhoto(match), false)
})

test('a plain search still needs a photo', () => {
  const match = matchFor(searchFor('Victor Santos'), 'Maria Santos')
  assert.equal(engine.isReciprocal(match), false)
  assert.equal(engine.needsPhoto(match), true)
})

test('below 85 in either direction there is no reciprocal badge and a photo is needed', () => {
  const anna = engine.addPerson({ name: 'Anna Lee', sex: 'female', age: 30 }, 1)
  const ben = engine.addPerson({ name: 'Ben Ray', sex: 'male', age: 30 }, 2)
  // Ben describes Anna with the right name but the wrong age, so his side scores about 82: not 85.
  const bens = engine.addSearch({ shelterId: 2, searcherPersonId: ben.id, target: { name: 'Anna Lee', sex: 'female', age: 20 } })
  const hers = engine.addSearch({ shelterId: 1, searcherPersonId: anna.id, target: { name: 'Ben Ray', sex: 'male', age: 30 } })
  engine.runSearch(hers)
  const match = matchFor(hers, 'Ben Ray')
  assert.ok(match.score >= 85) // her side is strong
  assert.equal(engine.isReciprocal(match), false)
  assert.equal(engine.resultCard(match).reciprocal, false)
  assert.equal(engine.resultCard(match).photo_required, true)
  assert.equal(engine.needsPhoto(match), true)

  // Once his side describes her at 85 or more, it becomes reciprocal in both directions.
  db.prepare('UPDATE searches SET age = 30 WHERE id = ?').run(bens.id)
  assert.equal(engine.isReciprocal(match), true)
  assert.equal(engine.needsPhoto(match), false)
})

test('accepting closes only the request search and the found person\'s own search', () => {
  const elenaSearch = searchFor('Elena Delgado')
  const rosa = person('Rosa Delgado')
  const cousin = engine.addPerson({ name: 'Pablo Delgado', sex: 'male', age: 50 }, 2)
  const cousinSearch = engine.addSearch({ shelterId: 2, searcherPersonId: cousin.id, target: { name: 'Rosa Delgado', sex: 'female', age: 81 } })
  const lookalikeSearch = engine.addSearch({ shelterId: 2, searcherPersonId: cousin.id, target: { name: 'Rosa Delgato', sex: 'female', age: 80 } })
  const rosaSearch = engine.addSearch({ shelterId: 3, searcherPersonId: rosa.id, target: { name: 'Elena Delgado', sex: 'female', age: 52 } })

  const match = matchFor(elenaSearch, 'Rosa Delgado')
  const id = engine.createRequest({ match, message: 'hi', photo: null })
  engine.acceptRequest(db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(id))

  const status = (s) => db.prepare('SELECT status FROM searches WHERE id = ?').get(s.id).status
  assert.equal(status(elenaSearch), 'closed')
  assert.equal(status(rosaSearch), 'closed')
  assert.equal(status(cousinSearch), 'open')
  assert.equal(status(lookalikeSearch), 'open')
})

test('after a decline, repeat requests are dropped and the sender still sees pending', () => {
  const search = searchFor('Victor Santos')
  const match = matchFor(search, 'Maria Santos')
  const first = db.prepare('SELECT * FROM contact_requests WHERE match_id = ?').get(match.id)
  db.prepare("UPDATE contact_requests SET status = 'declined' WHERE id = ?").run(first.id)

  const requests = () => db.prepare('SELECT COUNT(*) AS n FROM contact_requests').get().n
  const notifications = () => db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n
  const before = { requests: requests(), notifications: notifications(), photos: photoCount() }

  const id = engine.createRequest({ match, message: 'please', photo: { buffer: Buffer.from('x') } })

  assert.equal(id, first.id)
  assert.equal(requests(), before.requests)
  assert.equal(notifications(), before.notifications)
  assert.equal(photoCount(), before.photos)
  assert.equal(engine.resultCard(match).request, 'pending')
})

test('a decline also covers new searches from the same searcher to the same person', () => {
  const first = searchFor('Victor Santos')
  const maria = person('Maria Santos')
  // Same searcher, new search describing the same woman.
  const second = engine.addSearch({ shelterId: 1, searcherPersonId: first.searcher_person_id, target: { name: 'Maria Santos', sex: 'female', age: 36 } })
  engine.runSearch(second)
  const match = matchFor(second, 'Maria Santos')
  const notifications = () => db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n
  const before = { notifications: notifications(), photos: photoCount() }

  engine.createRequest({ match, message: 'again', photo: { buffer: Buffer.from('x') } })

  const waiting = db.prepare("SELECT COUNT(*) AS n FROM contact_requests r JOIN matches m ON m.id = r.match_id WHERE r.status = 'pending' AND m.person_id = ?").get(maria.id).n
  assert.equal(waiting, 0)
  assert.equal(notifications(), before.notifications)
  assert.equal(photoCount(), before.photos)
  assert.equal(engine.resultCard(match).request, 'pending')
})

test('a different searcher is not affected by that decline', () => {
  const other = engine.addPerson({ name: 'Rita Santos', sex: 'female', age: 60 }, 2)
  const search = engine.addSearch({ shelterId: 2, searcherPersonId: other.id, target: { name: 'Maria Santos', sex: 'female', age: 36 } })
  engine.runSearch(search)
  const match = matchFor(search, 'Maria Santos')
  engine.createRequest({ match, message: 'hello', photo: null })
  const maria = person('Maria Santos')
  const waiting = db.prepare("SELECT COUNT(*) AS n FROM contact_requests r JOIN matches m ON m.id = r.match_id WHERE r.status = 'pending' AND m.person_id = ?").get(maria.id).n
  assert.equal(waiting, 1)
})

test('accepting marks the found person\'s own search as reunited too, with its own notice', () => {
  // Marcus and Tanya search for each other. Tanya (St. Mary's) accepts Marcus's request (Riverside).
  const marcusSearch = searchFor('Marcus Hill')
  const tanyaSearch = searchFor('Tanya Hill')
  const match = matchFor(marcusSearch, 'Tanya Hill')
  const id = engine.createRequest({ match, message: 'Tanya!', photo: null })
  engine.acceptRequest(db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(id))

  const status = (x) => db.prepare('SELECT status FROM searches WHERE id = ?').get(x.id).status
  assert.equal(status(marcusSearch), 'closed')
  assert.equal(status(tanyaSearch), 'closed')
  // Her search now points at Marcus as connected, so her card can show where he is.
  const hers = db.prepare("SELECT * FROM matches WHERE search_id = ? AND state = 'connected'").get(tanyaSearch.id)
  assert.equal(hers.person_id, person('Marcus Hill').id)
  // Each shelter gets one reunion notice, tied to its own search.
  const notices = (shelter) => db.prepare("SELECT match_id FROM notifications WHERE kind = 'reunion' AND shelter_id = ?").all(shelter).map((n) => n.match_id)
  assert.ok(notices(1).includes(match.id))
  assert.ok(notices(2).includes(hers.id))
})

test('confirming a no-name match saves the name from the search on the person, and never overwrites a name', () => {
  // The registered child has no name; the family says he is Leo Martinez.
  const leo = engine.addPerson({ sex: 'male', age: 7, marks: 'blue cast on left arm', last_place: 'Maple Elementary' }, 1)
  const mom = engine.addPerson({ name: 'Rosa Martinez', sex: 'female', age: 34 }, 2)
  const s1 = engine.addSearch({ shelterId: 2, searcherPersonId: mom.id, target: { name: 'Leo Martinez', sex: 'male', age: 7, marks: 'blue cast on left arm', last_place: 'Maple Elementary' } })
  engine.runSearch(s1)
  const m1 = db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(s1.id, leo.id)
  assert.equal(m1.state, 'needs_review')
  assert.equal(db.prepare('SELECT name FROM people WHERE id = ?').get(leo.id).name, null) // nothing is saved before staff confirms
  engine.approveMatch(m1.id)
  assert.equal(db.prepare('SELECT name FROM people WHERE id = ?').get(leo.id).name, 'Leo Martinez')

  // The other way round: the person has a name, the search has none. Confirming keeps the registered name.
  const ana = engine.addPerson({ name: 'Ana Quintero', sex: 'female', age: 41, marks: 'scar on chin', last_place: 'Birch Street' }, 1)
  const sib = engine.addPerson({ name: 'Eva Quintero', sex: 'female', age: 38 }, 2)
  const s2 = engine.addSearch({ shelterId: 2, searcherPersonId: sib.id, target: { sex: 'female', age: 41, marks: 'scar on chin', last_place: 'Birch Street' } })
  engine.runSearch(s2)
  const m2 = db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(s2.id, ana.id)
  assert.equal(m2.state, 'needs_review')
  engine.approveMatch(m2.id)
  assert.equal(db.prepare('SELECT name FROM people WHERE id = ?').get(ana.id).name, 'Ana Quintero')
})
