import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, tokenSimilarity, ageSimilarity, scoreMatch } from './matching.js'

test('normalize removes accents, case and punctuation', () => {
  assert.equal(normalize('  José-María, O\'Neil '), 'jose maria o neil')
})

test('names match in any token order and with two surnames', () => {
  assert.ok(tokenSimilarity('Maria Lopez Garcia', 'Lopez Maria') >= 0.99)
  assert.ok(tokenSimilarity('Jon Smith', 'John Smith') > 0.9)
  assert.ok(tokenSimilarity('Maria Lopez', 'Peter Brown') < 0.6)
})

test('age similarity falls from 3 to 15 years', () => {
  assert.equal(ageSimilarity(40, 43), 1)
  assert.equal(ageSimilarity(40, 55), 0)
  assert.ok(ageSimilarity(40, 47) > 0 && ageSimilarity(40, 47) < 1)
  assert.equal(ageSimilarity(null, 40), null)
})

test('different known sex gives zero', () => {
  const result = scoreMatch({ sex: 'male', name: 'Sam Lee' }, { sex: 'female', name: 'Sam Lee' })
  assert.equal(result.score, 0)
})

test('missing fields are not penalised', () => {
  const wanted = { sex: 'female', name: 'Ana Ruiz', age: 30, last_place: 'Lincoln Elementary' }
  const complete = { sex: 'female', name: 'Ana Ruiz', age: 31, last_place: 'Lincoln Elementary', marks: 'glasses' }
  const sparse = { sex: 'female', name: 'Ana Ruiz', age: 31 }
  assert.ok(scoreMatch(wanted, complete).score >= 95)
  assert.ok(scoreMatch(wanted, sparse).score >= 90)
})

test('a group transfer connects a nameless child to the search', () => {
  const wanted = { sex: 'male', age: 8, last_place: 'Lincoln Elementary', last_seen_day: '2026-09-10' }
  const child = { sex: 'male', age: 8, shelter_id: 2, last_place: null }
  const bus = { origin_place: 'Lincoln Elementary', departed_day: '2026-09-10', transport: 'bus', destination_shelter_id: 2 }
  const withBus = scoreMatch(wanted, child, [bus])
  assert.ok(withBus.reasons.includes('Arrived by a bus that left from that place'))
  assert.ok(withBus.score > scoreMatch(wanted, child, []).score)
})

test('a transfer to a different shelter does not connect', () => {
  const wanted = { last_place: 'Lincoln Elementary', last_seen_day: '2026-09-10' }
  const person = { shelter_id: 3 }
  const bus = { origin_place: 'Lincoln Elementary', departed_day: '2026-09-10', transport: 'bus', destination_shelter_id: 2 }
  assert.equal(scoreMatch(wanted, person, [bus]).reasons.length, 0)
})

test('a lone matching name stays below the alert threshold', () => {
  const result = scoreMatch({ name: 'Ana Ruiz' }, { name: 'Ana Ruiz' })
  assert.ok(result.score < 85)
})

test('unrelated names score zero, not a baseline', () => {
  assert.equal(tokenSimilarity('Tomas Ferrer', 'Grace Brown'), 0)
})
