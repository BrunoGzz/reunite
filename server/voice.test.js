import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFields } from './routes/voice.js'

const f = (value, confidence = 'high') => ({ value, confidence })

test('keeps valid values and their confidence', () => {
  const { fields, language } = normalizeFields({
    name: f('Maria Lopez', 'low'), sex: f('female'), age: f(30), hair_color: f('black'), language: ' Spanish ',
  })
  assert.deepEqual(fields.name, { value: 'Maria Lopez', confidence: 'low' })
  assert.equal(fields.age.value, 30)
  assert.equal(language, 'Spanish')
})

test('drops nulls, empty text and values outside the allowed lists', () => {
  const { fields } = normalizeFields({
    name: f(null), marks: f('   '), sex: f('unknown'), height: f('giant'), age: f(150), arrival_method: f('teleport'),
    last_seen_day: f('yesterday'), hair_color: f('blond'),
  })
  assert.deepEqual(Object.keys(fields), ['hair_color'])
})

test('a missing or odd confidence becomes low', () => {
  const { fields } = normalizeFields({ marks: { value: 'scar' }, last_place: f('Lincoln Elementary', 'certain') })
  assert.equal(fields.marks.confidence, 'low')
  assert.equal(fields.last_place.confidence, 'low')
})

test('needs_assistance is only taken in person mode and only when true', () => {
  assert.ok(normalizeFields({ needs_assistance: f(true) }, 'person').fields.needs_assistance)
  assert.equal(normalizeFields({ needs_assistance: f(true) }, 'target').fields.needs_assistance, undefined)
  assert.equal(normalizeFields({ needs_assistance: f(false) }, 'person').fields.needs_assistance, undefined)
})
