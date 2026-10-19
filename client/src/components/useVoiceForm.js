import { useState } from 'react'

// Form state for a described person, plus what the voice input filled in.
// doubtful: fields the AI was unsure about (yellow). heard: fields filled clearly.
export function useVoiceForm(makeEmpty) {
  const [values, setValues] = useState(makeEmpty)
  const [doubtful, setDoubtful] = useState([])
  const [heard, setHeard] = useState([])
  const [spoken, setSpoken] = useState(null)

  const without = (list, field) => list.filter((f) => f !== field)

  // Typing in a field means the volunteer has checked it.
  function change(field, value) {
    setValues((v) => ({ ...v, [field]: value }))
    setDoubtful((d) => without(d, field))
    setHeard((h) => without(h, field))
  }

  // Empty or missing fields in the result never wipe what is already in the form.
  function fill(result) {
    const next = { ...values }
    const low = []
    const clear = []
    for (const [field, { value, confidence }] of Object.entries(result.fields)) {
      next[field] = typeof value === 'number' ? String(value) : value
      ;(confidence === 'low' ? low : clear).push(field)
    }
    // The speaker may be the volunteer, so the spoken language is only a suggestion.
    if (!next.languages && result.language) {
      next.languages = result.language
      low.push('languages')
    }
    const touched = [...low, ...clear]
    setValues(next)
    setDoubtful((d) => [...d.filter((f) => !touched.includes(f)), ...low])
    setHeard((h) => [...h.filter((f) => !touched.includes(f)), ...clear])
    setSpoken({ transcript: result.transcript, language: result.language })
  }

  function reset() {
    setValues(makeEmpty())
    setDoubtful([])
    setHeard([])
    setSpoken(null)
  }

  return { values, doubtful, heard, spoken, change, fill, reset }
}
