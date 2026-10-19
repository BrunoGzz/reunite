import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.REUNITE_DB = ':memory:'
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
  assert.equal(match.is_reciprocal, 1)
  assert.equal(engine.needsPhoto(match), false)
})

test('a plain search still needs a photo', () => {
  const match = matchFor(searchFor('Victor Santos'), 'Maria Santos')
  assert.equal(engine.needsPhoto(match), true)
})

test('reciprocal between 70 and 85 keeps the badge but needs a photo', () => {
  const anna = engine.addPerson({ name: 'Anna Lee', sex: 'female', age: 30 }, 1)
  const ben = engine.addPerson({ name: 'Ben Ray', sex: 'male', age: 30 }, 2)
  // Ben describes Anna with the right name but the wrong age, so his side scores about 82.
  engine.addSearch({ shelterId: 2, searcherPersonId: ben.id, target: { name: 'Anna Lee', sex: 'female', age: 20 } })
  const hers = engine.addSearch({ shelterId: 1, searcherPersonId: anna.id, target: { name: 'Ben Ray', sex: 'male', age: 30 } })
  engine.runSearch(hers)
  const match = matchFor(hers, 'Ben Ray')
  assert.equal(match.is_reciprocal, 1)
  assert.ok(match.score >= 85)
  assert.equal(engine.needsPhoto(match), true)
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

  const waiting = db.prepare("SELECT COUNT(*) AS n FROM contact_requests WHERE status = 'pending' AND routed_to = 'shelter' AND to_shelter_id = ?").get(maria.shelter_id).n
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
  const waiting = db.prepare("SELECT COUNT(*) AS n FROM contact_requests WHERE status = 'pending' AND routed_to = 'shelter' AND to_shelter_id = ?").get(maria.shelter_id).n
  assert.equal(waiting, 1)
})
