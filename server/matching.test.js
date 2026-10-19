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

test('the last known place connects a nameless child to the search', () => {
  const wanted = { name: 'Daniel Reyes', sex: 'male', age: 8, last_place: 'Lincoln Elementary', marks: 'red backpack' }
  const child = { sex: 'male', age: 8, last_place: 'Lincoln Elementary', marks: 'red backpack' }
  const result = scoreMatch(wanted, child)
  assert.equal(result.nameScore, null) // no name on one side, so this goes to review rather than an alert
  assert.ok(result.score >= 85)
  assert.ok(result.reasons.includes('Same last known place: Lincoln Elementary'))
})

test('a different place does not count as the same place', () => {
  const result = scoreMatch({ last_place: 'Lincoln Elementary', age: 8 }, { last_place: 'Harbor Mall', age: 8 })
  assert.ok(!result.reasons.some((r) => r.startsWith('Same last known place')))
})

test('a lone matching name stays below the alert threshold', () => {
  const result = scoreMatch({ name: 'Ana Ruiz' }, { name: 'Ana Ruiz' })
  assert.ok(result.score < 85)
})

test('unrelated names score zero, not a baseline', () => {
  assert.equal(tokenSimilarity('Tomas Ferrer', 'Grace Brown'), 0)
})
