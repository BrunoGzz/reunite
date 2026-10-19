// Pure matching functions. No database access here.

const WEIGHTS = { name: 35, place: 25, age: 15, marks: 15, looks: 10 }

// Below this much total weight we shrink the score, so one lone matching
// field (for example only a name) cannot look like a near-certain match.
const MIN_EVIDENCE = 50

const TOKEN_MIN = 0.8

const STOP_WORDS = new Set(['a', 'an', 'the', 'on', 'in', 'of', 'and', 'with', 'has', 'have', 'his', 'her', 'left', 'right', 'is', 'he', 'she'])

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(text) {
  const t = normalize(text)
  return t ? t.split(' ') : []
}

export function jaroWinkler(a, b) {
  if (a === b) return 1
  if (!a || !b) return 0
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aHit = new Array(a.length).fill(false)
  const bHit = new Array(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const from = Math.max(0, i - range)
    const to = Math.min(b.length - 1, i + range)
    for (let j = from; j <= to; j++) {
      if (!bHit[j] && a[i] === b[j]) {
        aHit[i] = true
        bHit[j] = true
        matches++
        break
      }
    }
  }
  if (matches === 0) return 0
  let swaps = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue
    while (!bHit[k]) k++
    if (a[i] !== b[k]) swaps++
    k++
  }
  const jaro = (matches / a.length + matches / b.length + (matches - swaps / 2) / matches) / 3
  let prefix = 0
  while (prefix < 4 && a[prefix] && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

// Compares two names (or place names) token by token, in any order.
// Each token is paired with its best partner, and we average over the shorter side.
export function tokenSimilarity(textA, textB) {
  const a = tokens(textA)
  const b = tokens(textB)
  if (a.length === 0 || b.length === 0) return null
  const pairs = []
  // Tokens that are only vaguely alike count as different, so unrelated names score 0.
  const close = (x, y) => { const s = jaroWinkler(x, y); return s >= TOKEN_MIN ? s : 0 }
  a.forEach((ta, i) => b.forEach((tb, j) => pairs.push({ i, j, s: close(ta, tb) })))
  pairs.sort((x, y) => y.s - x.s)
  const usedA = new Set()
  const usedB = new Set()
  let total = 0
  for (const p of pairs) {
    if (usedA.has(p.i) || usedB.has(p.j)) continue
    usedA.add(p.i)
    usedB.add(p.j)
    total += p.s
  }
  return total / Math.min(a.length, b.length)
}

export function ageSimilarity(ageA, ageB) {
  if (ageA == null || ageB == null) return null
  const diff = Math.abs(ageA - ageB)
  if (diff <= 3) return 1
  if (diff >= 15) return 0
  return (15 - diff) / 12
}

function keywords(text) {
  return new Set(tokens(text).filter((w) => w.length > 2 && !STOP_WORDS.has(w)))
}

// Returns { value, shared } or null when one side has no marks.
export function marksSimilarity(marksA, marksB) {
  const a = keywords(marksA)
  const b = keywords(marksB)
  if (a.size === 0 || b.size === 0) return null
  const shared = [...a].filter((w) => b.has(w))
  return { value: shared.length / Math.min(a.size, b.size), shared }
}

function known(value) {
  return value && value !== 'unknown'
}

// Height and hair: share of the comparable fields that agree.
function looksSimilarity(wanted, person) {
  const checks = []
  if (known(wanted.height) && known(person.height)) {
    checks.push({ same: wanted.height === person.height, label: 'Same height' })
  }
  if (known(wanted.hair_color) && known(person.hair_color)) {
    checks.push({ same: normalize(wanted.hair_color) === normalize(person.hair_color), label: 'Same hair colour' })
  }
  if (checks.length === 0) return null
  const same = checks.filter((c) => c.same)
  return { value: same.length / checks.length, labels: same.map((c) => c.label) }
}

// wanted: the description in a search. person: a registered person.
// Returns { score (0-100), nameScore (0-1 or null), reasons: [text] }.
export function scoreMatch(wanted, person) {
  const none = { score: 0, nameScore: null, reasons: [] }
  if (known(wanted.sex) && known(person.sex) && wanted.sex !== person.sex) return none

  const parts = [] // { weight, value }
  const reasons = []

  const nameScore = tokenSimilarity(wanted.name, person.name)
  if (nameScore !== null) {
    parts.push({ weight: WEIGHTS.name, value: nameScore })
    if (nameScore >= 0.8) reasons.push(`Name similar (${Math.round(nameScore * 100)}%)`)
  }

  const placeScore = tokenSimilarity(wanted.last_place, person.last_place)
  if (placeScore !== null) {
    parts.push({ weight: WEIGHTS.place, value: placeScore })
    if (placeScore >= 0.85) reasons.push(`Same last known place: ${wanted.last_place}`)
  }

  const ageScore = ageSimilarity(wanted.age, person.age)
  if (ageScore !== null) {
    parts.push({ weight: WEIGHTS.age, value: ageScore })
    if (ageScore === 1) reasons.push('Age is very close')
  }

  const marks = marksSimilarity(wanted.marks, person.marks)
  if (marks) {
    parts.push({ weight: WEIGHTS.marks, value: marks.value })
    if (marks.shared.length > 0) reasons.push(`Distinctive marks match: ${marks.shared.join(', ')}`)
  }

  const looks = looksSimilarity(wanted, person)
  if (looks) {
    parts.push({ weight: WEIGHTS.looks, value: looks.value })
    reasons.push(...looks.labels)
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0)
  if (totalWeight === 0) return none
  const weighted = parts.reduce((sum, p) => sum + p.weight * p.value, 0)
  const evidence = Math.min(1, totalWeight / MIN_EVIDENCE)
  const score = Math.round((weighted / totalWeight) * evidence * 100)
  return { score, nameScore, reasons }
}

// Non-identifying age range for result cards, for example "30 to 40".
export function ageRange(age) {
  if (age == null) return 'age unknown'
  if (age < 10) return `${age} years old`
  const low = Math.floor(age / 10) * 10
  return `${low} to ${low + 10}`
}
