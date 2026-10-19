// Core rules that touch the database: registering, searching, alerts and contact requests.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import db, { now, photoDir } from './db.js'
import { scoreMatch, ageRange } from './matching.js'

export const SHOW_MIN = 50 // lowest score shown to a volunteer
export const ALERT_MIN = 85 // lowest score that can raise an alert
export const NAME_MIN = 0.8 // name similarity needed for an automatic alert

const DESCRIPTION_FIELDS = [
  'name', 'sex', 'age', 'height', 'hair_color', 'marks', 'languages', 'last_place',
]
const SEXES = ['male', 'female', 'unknown']
const HEIGHTS = ['short', 'medium', 'tall', 'unknown']

// Turns form input into clean values: trimmed text, empty becomes null.
export function cleanDescription(input = {}) {
  const out = {}
  for (const field of DESCRIPTION_FIELDS) {
    const value = typeof input[field] === 'string' ? input[field].trim() : input[field]
    out[field] = value === '' || value === undefined ? null : value
  }
  if (out.name && out.name.toLowerCase() === 'unknown') out.name = null
  const age = parseInt(out.age, 10)
  out.age = Number.isFinite(age) && age >= 0 && age < 120 ? age : null
  if (!SEXES.includes(out.sex)) out.sex = 'unknown'
  if (!HEIGHTS.includes(out.height)) out.height = 'unknown'
  return out
}

function insertRow(table, row) {
  const columns = Object.keys(row)
  const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((c) => '@' + c).join(',')})`
  return db.prepare(sql).run(row).lastInsertRowid
}

export function addPerson(input, shelterId) {
  const data = cleanDescription(input)
  const row = {
    ...data,
    shelter_id: shelterId,
    name_is_alias: input.name_is_alias ? 1 : 0,
    is_minor: data.age !== null && data.age < 18 ? 1 : 0,
    needs_assistance: input.needs_assistance ? 1 : 0,
    created_at: now(),
  }
  const id = insertRow('people', row)
  return db.prepare('SELECT * FROM people WHERE id = ?').get(id)
}

export function addSearch({ shelterId, searcherPersonId, target, email, emailOptIn }) {
  const row = {
    ...cleanDescription(target),
    shelter_id: shelterId,
    searcher_person_id: searcherPersonId,
    email: email ? String(email).trim() : null,
    email_opt_in: email && emailOptIn ? 1 : 0,
    status: 'open',
    closed_reason: null,
    created_at: now(),
  }
  const id = insertRow('searches', row)
  return db.prepare('SELECT * FROM searches WHERE id = ?').get(id)
}

export function notify({ shelterId = null, kind, text, matchId = null, requestId = null, toAddress = null }) {
  insertRow('notifications', {
    shelter_id: shelterId, kind, text, to_address: toAddress,
    match_id: matchId, request_id: requestId, is_read: 0, created_at: now(),
  })
}

// Simulated email: saved, logged, shown in the UI. Nothing is really sent.
function sendEmail(shelterId, matchId, address, text) {
  console.log(`[email to ${address}] ${text}`)
  notify({ shelterId, kind: 'email', matchId, text: `Email sent to ${address}`, toAddress: address })
}

function upsertMatch(search, person, result) {
  db.prepare(`
    INSERT INTO matches (search_id, person_id, score, name_score, reasons, state, created_at)
    VALUES (?, ?, ?, ?, ?, 'new', ?)
    ON CONFLICT (search_id, person_id) DO UPDATE SET
      score = excluded.score, name_score = excluded.name_score, reasons = excluded.reasons
  `).run(search.id, person.id, result.score, result.nameScore, JSON.stringify(result.reasons), now())
  return db.prepare('SELECT * FROM matches WHERE search_id = ? AND person_id = ?').get(search.id, person.id)
}

// If the candidate is also looking for the searcher (describing them at 85% or more), returns the candidate's own search.
function reciprocalSearch(search, person) {
  const searcher = db.prepare('SELECT * FROM people WHERE id = ?').get(search.searcher_person_id)
  const theirs = db.prepare("SELECT * FROM searches WHERE status = 'open' AND searcher_person_id = ?").all(person.id)
  for (const other of theirs) {
    const result = scoreMatch(other, searcher)
    if (result.score >= ALERT_MIN) return { search: other, searcher, result }
  }
  return null
}

function ageWindow(age) {
  return age === null || age === undefined ? [null, null] : [age - 15, age + 15]
}

// Candidates are pre-filtered in SQL by sex and age so we never score everyone.
function candidatesFor(search) {
  const [low, high] = ageWindow(search.age)
  return db.prepare(`
    SELECT * FROM people
    WHERE id != @self
      AND (@sex = 'unknown' OR sex IN (@sex, 'unknown'))
      AND (@low IS NULL OR age IS NULL OR age BETWEEN @low AND @high)
  `).all({ self: search.searcher_person_id, sex: search.sex, low, high })
}

function openSearchesFor(person) {
  const [low, high] = ageWindow(person.age)
  return db.prepare(`
    SELECT * FROM searches
    WHERE status = 'open' AND searcher_person_id != @self
      AND (sex = 'unknown' OR @sex = 'unknown' OR sex = @sex)
      AND (@low IS NULL OR age IS NULL OR age BETWEEN @low AND @high)
  `).all({ self: person.id, sex: person.sex, low, high })
}

// Decides whether a strong match raises an alert, goes to review, or just waits.
function raiseAlertIfStrong(match, search, person, recip, fromNewSearch) {
  if (match.score < ALERT_MIN || match.state !== 'new') return
  const nameKnown = match.name_score !== null
  if (!nameKnown) {
    db.prepare("UPDATE matches SET state = 'needs_review' WHERE id = ?").run(match.id) // shows up under "Needs review"
    return
  }
  if (match.name_score < NAME_MIN) return
  // A fresh search already shows its results on screen, so only reciprocal ones raise alerts.
  if (fromNewSearch && !recip) return
  alertShelters(match, search, person, recip)
}

export function alertShelters(match, search, person, recip) {
  db.prepare("UPDATE matches SET state = 'alerted' WHERE id = ?").run(match.id)
  notify({
    shelterId: search.shelter_id, kind: 'match_alert', matchId: match.id,
    text: `Possible match found for your search for ${search.name || 'someone'}`,
  })
  if (recip) {
    const mirror = upsertMatch(recip.search, recip.searcher, recip.result)
    db.prepare("UPDATE matches SET state = 'alerted' WHERE id = ?").run(mirror.id)
    notify({
      shelterId: person.shelter_id, kind: 'match_alert', matchId: mirror.id,
      text: `Reciprocal match found for your search for ${recip.search.name || 'someone'}`,
    })
  }
}

// Runs a search and stores the matches. Returns the saved match rows above SHOW_MIN.
export function runSearch(search) {
  const saved = []
  for (const person of candidatesFor(search)) {
    const result = scoreMatch(search, person)
    if (result.score < SHOW_MIN) continue
    const recip = result.score >= ALERT_MIN ? reciprocalSearch(search, person) : null // reciprocal needs 85% both ways
    const match = upsertMatch(search, person, result)
    raiseAlertIfStrong(match, search, person, recip, true)
    saved.push(match)
  }
  return saved
}

// Called when a new person is registered: compares them with all open searches.
export function matchNewPerson(person) {
  for (const search of openSearchesFor(person)) {
    const result = scoreMatch(search, person)
    if (result.score < SHOW_MIN) continue
    const recip = result.score >= ALERT_MIN ? reciprocalSearch(search, person) : null
    const match = upsertMatch(search, person, result)
    raiseAlertIfStrong(match, search, person, recip, false)
  }
}

export function approveMatch(matchId) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId)
  if (!match || match.state !== 'needs_review') return null
  const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(match.search_id)
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(match.person_id)
  alertShelters(match, search, person, reciprocalSearch(search, person)) // the match is already at 85% or more
  return match
}

export function rejectMatch(matchId) {
  return db.prepare("UPDATE matches SET state = 'rejected' WHERE id = ? AND state = 'needs_review'").run(matchId).changes
}

function shelterInfo(id) {
  return db.prepare('SELECT name, address, phone, instructions FROM shelters WHERE id = ?').get(id)
}

function placeLine(shelterId) {
  const s = shelterInfo(shelterId)
  return `${s.name}, ${s.address}, phone ${s.phone}`
}

// What the receiving shelter sees right after accepting.
export function reunionForReceiver(request) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(request.match_id)
  const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(match.search_id)
  const searcher = db.prepare('SELECT name FROM people WHERE id = ?').get(search.searcher_person_id)
  return { person_name: searcher.name, shelter: shelterInfo(search.shelter_id) }
}

// A result card for the searcher's volunteer. Never includes the candidate's name or shelter,
// unless the candidate already accepted contact.
export function resultCard(match) {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(match.person_id)
  const request = db.prepare('SELECT * FROM contact_requests WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(match.id)
  const sex = person.sex === 'unknown' ? 'Sex unknown' : person.sex[0].toUpperCase() + person.sex.slice(1)
  const card = {
    match_id: match.id,
    search_id: match.search_id,
    score: match.score,
    summary: `${sex}, ${ageRange(person.age)}`,
    reasons: JSON.parse(match.reasons),
    reciprocal: isReciprocal(match),
    photo_required: !isReciprocal(match),
    request: null,
  }
  if (request && request.status === 'accepted') {
    card.request = 'accepted'
    card.reunion = { person_name: person.name, shelter: shelterInfo(person.shelter_id) }
  } else if (request) {
    card.request = 'pending' // declined looks exactly the same
  }
  return card
}

// Who may decide a contact request (and see its photo). A shelter can never decide a request it sent, so it
// cannot approve its own search: the exception is when the person asked about is registered at that same
// shelter, where the request is decided on the spot. Everyone else may decide a request in the review queue;
// otherwise only the shelter the request is for.
export function mayDecide(request, shelterId) {
  if (request.from_shelter_id === shelterId) return request.to_shelter_id === shelterId
  return request.routed_to === 'review' || request.to_shelter_id === shelterId
}

export function deletePhoto(file) {
  if (file) fs.rmSync(path.join(photoDir, file), { force: true })
}

// Reciprocal means both searches describe each other at 85% or more. Then the match gets the badge and the
// contact request needs no photo. Anything lower, in either direction, is not reciprocal.
export function isReciprocal(match) {
  if (match.score < ALERT_MIN) return false
  const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(match.search_id)
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(match.person_id)
  return !!reciprocalSearch(search, person)
}

export const needsPhoto = (match) => !isReciprocal(match)

function savePhoto(file) {
  if (!file) return null
  const name = crypto.randomBytes(16).toString('hex')
  fs.writeFileSync(path.join(photoDir, name), file.buffer)
  return name
}

// Returns the request id. Repeats are quietly absorbed:
// - while one is pending for this match, nothing new is created;
// - once a searcher has been declined by a person, any later request from that searcher to that
//   person (even from a new search) is recorded as declined and never reaches the receiving shelter.
// Either way the searcher sees "Pending confirmation".
export function createRequest({ match, message, photo }) {
  const earlier = db.prepare("SELECT id FROM contact_requests WHERE match_id = ? AND (status = 'pending' OR status = 'declined') ORDER BY id DESC LIMIT 1").get(match.id)
  if (earlier) return earlier.id

  const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(match.search_id)
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(match.person_id)

  const declinedBefore = db.prepare(`
    SELECT 1 FROM contact_requests r JOIN matches m ON m.id = r.match_id JOIN searches s ON s.id = m.search_id
    WHERE r.status = 'declined' AND s.searcher_person_id = ? AND m.person_id = ?
  `).get(search.searcher_person_id, person.id)
  if (declinedBefore) {
    return insertRow('contact_requests', {
      match_id: match.id, from_shelter_id: search.shelter_id, to_shelter_id: person.shelter_id,
      routed_to: 'shelter', message: null, photo_file: null,
      status: 'declined', created_at: now(), decided_at: now(),
    })
  }

  // Minors and people who need help deciding are not asked directly: their request goes to "Needs review".
  const special = person.is_minor || person.needs_assistance
  const id = insertRow('contact_requests', {
    match_id: match.id,
    from_shelter_id: search.shelter_id,
    to_shelter_id: person.shelter_id,
    routed_to: special ? 'review' : 'shelter',
    message: message || null,
    photo_file: savePhoto(photo),
    status: 'pending',
    created_at: now(),
  })
  return id
}

// Accepting reveals both shelters to each other and closes the related searches.
export function acceptRequest(request) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(request.match_id)
  const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(match.search_id)
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(match.person_id)
  const searcher = db.prepare('SELECT * FROM people WHERE id = ?').get(search.searcher_person_id)

  db.prepare("UPDATE matches SET state = 'connected' WHERE id = ?").run(match.id)
  db.prepare("UPDATE searches SET status = 'closed', closed_reason = 'accepted' WHERE id = ?").run(search.id)

  // Also close the found person's own search for the searcher, if there is one, and mark it as reunited too.
  // Other relatives' searches stay open: they may still need this person.
  const theirs = reciprocalSearch(search, person)
  if (theirs) {
    db.prepare("UPDATE searches SET status = 'closed', closed_reason = 'accepted' WHERE id = ?").run(theirs.search.id)
    const mirror = upsertMatch(theirs.search, theirs.searcher, theirs.result)
    db.prepare("UPDATE matches SET state = 'connected' WHERE id = ?").run(mirror.id)
    notify({ shelterId: person.shelter_id, kind: 'reunion', matchId: mirror.id, text: `Contact accepted. ${searcher.name || 'The family'} is at ${placeLine(search.shelter_id)}` })
  }

  notify({ shelterId: search.shelter_id, kind: 'reunion', matchId: match.id, text: `Contact accepted. ${person.name || 'The person'} can be found at ${placeLine(person.shelter_id)}` })
  if (search.email_opt_in && search.email) {
    sendEmail(search.shelter_id, match.id, search.email, `Good news: ${person.name || 'the person you are looking for'} accepted contact. Ask the volunteer at ${shelterInfo(search.shelter_id).name} for details.`)
  }
}
