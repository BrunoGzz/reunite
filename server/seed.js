// Demo data. Run with: npm run seed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import db, { now, photoDir } from './db.js'
import { addPerson, addSearch, runSearch, matchNewPerson, createRequest } from './engine.js'

const DAY = '2026-09-10'

// Registered live by the coordinator button, so evaluators can see the automatic alert happen.
export const LATE_ARRIVAL = {
  shelter: "St. Mary's Community Center",
  person: {
    name: 'Tom Whitaker', sex: 'male', age: 58, height: 'tall', hair_color: 'gray',
    marks: 'gray beard, bandaged left hand', languages: 'English', last_place: 'Pelican Street',
    last_seen_day: DAY, last_seen_part: 'evening', arrival_method: 'boat', moved_by: 'volunteer rescue boat',
  },
}

const SHELTERS = [
  { name: 'Riverside High School Shelter', address: '120 River Road, Gym entrance', phone: '555-0101', instructions: 'Come to the front desk and ask for the reunification table. Bring this reference if you have it.' },
  { name: "St. Mary's Community Center", address: '48 Church Street, Main hall', phone: '555-0102', instructions: 'Ask for the volunteer lead at the entrance. Families are reunited in the side room.' },
  { name: 'Harbor View Hotel (emergency housing)', address: '9 Harbor Drive, Front desk', phone: '555-0103', instructions: 'Ask the front desk for the evacuation coordinator. Call ahead if you need a wheelchair-accessible entrance.' },
]

const PLACES = ['Oak Ridge Apartments', 'Main Street Church', 'Harbor Mall', 'Pelican Street', 'Cedar Park Homes', 'Westside Clinic']
const ARRIVALS = ['bus', 'own car', 'boat', 'ambulance', 'other']
const HEIGHTS = ['short', 'medium', 'tall']
const HAIR = ['black', 'brown', 'blond', 'gray', 'red']
const MARKS = [null, 'glasses', null, 'tattoo on left arm', null, 'scar on chin', null]
const FEMALE = ['Linda', 'Grace', 'Priya', 'Fatima', 'Ines', 'Olga', 'Mei', 'Aisha', 'Sofia', 'Brenda', 'Jasmine', 'Keisha', 'Lucia', 'Hannah', 'Ruth']
const MALE = ['James', 'Omar', 'Luis', 'Chen', 'Andre', 'Pavel', 'Jamal', 'Diego', 'Hector', 'Samuel', 'Ravi', 'Ethan', 'Walter', 'Mateo', 'Isaac']
const SURNAMES = ['Nguyen', 'Brown', 'Okafor', 'Martinez', 'Kowalski', 'Patel', 'Johnson', 'Silva', 'Haddad', 'Fischer', 'Lee', 'Thompson', 'Alvarez', 'Murphy', 'Costa']

function addFillerPeople(shelterIds) {
  for (let i = 0; i < 30; i++) {
    const female = i % 2 === 0
    addPerson({
      name: `${(female ? FEMALE : MALE)[Math.floor(i / 2)]} ${SURNAMES[(i * 7) % SURNAMES.length]}`,
      sex: female ? 'female' : 'male',
      age: 19 + ((i * 13) % 55),
      height: HEIGHTS[i % 3],
      hair_color: HAIR[i % 5],
      marks: MARKS[i % MARKS.length],
      languages: 'English',
      last_place: PLACES[i % PLACES.length],
      last_seen_day: DAY,
      last_seen_part: ['morning', 'afternoon', 'evening'][i % 3],
      arrival_method: ARRIVALS[i % ARRIVALS.length],
    }, shelterIds[i % 3])
  }
}

export function seed() {
  const ids = SHELTERS.map((s) => db.prepare('INSERT INTO shelters (name, address, phone, instructions) VALUES (?, ?, ?, ?)')
    .run(s.name, s.address, s.phone, s.instructions).lastInsertRowid)
  const [riverside, stMarys, harbor] = ids.map(Number)

  addFillerPeople([riverside, stMarys, harbor])

  const move = (m) => db.prepare(`INSERT INTO group_movements (origin_place, departed_day, departed_part, transport, agency, destination_shelter_id, notes, created_at)
    VALUES (@origin_place, @departed_day, @departed_part, @transport, @agency, @destination_shelter_id, @notes, @created_at)`).run({ ...m, created_at: now() })

  // Case 1: school bus. The child gave no name, so only the trace connects him to his mother.
  move({ origin_place: 'Lincoln Elementary', departed_day: DAY, departed_part: 'afternoon', transport: 'bus', agency: 'County School District', destination_shelter_id: riverside, notes: 'School bus 14, 22 children' })
  const carla = addPerson({ name: 'Carla Reyes', sex: 'female', age: 36, last_place: 'Oak Ridge Apartments', languages: 'Spanish, English' }, stMarys)
  const motherSearch = addSearch({ shelterId: stMarys, searcherPersonId: carla.id, email: 'carla.reyes@example.com', emailOptIn: true,
    target: { name: 'Daniel Reyes', sex: 'male', age: 8, last_place: 'Lincoln Elementary', last_seen_day: DAY, last_seen_part: 'afternoon', marks: 'red backpack' } })

  // Case 2: care home transfer by another agency, person needs assistance.
  move({ origin_place: 'Sunrise Care Home', departed_day: DAY, departed_part: 'morning', transport: 'agency transfer', agency: 'Coastal Care Transport', destination_shelter_id: harbor, notes: 'Residents moved to Harbor View Hotel' })
  const elena = addPerson({ name: 'Elena Delgado', sex: 'female', age: 52, last_place: 'Cedar Park Homes' }, riverside)
  const daughterSearch = addSearch({ shelterId: riverside, searcherPersonId: elena.id,
    target: { name: 'Rosa Delgado', sex: 'female', age: 81, last_place: 'Sunrise Care Home', last_seen_day: DAY, marks: 'wheelchair, hearing aid' } })

  // Case 3: a couple looking for each other.
  const marcus = addPerson({ name: 'Marcus Hill', sex: 'male', age: 44, height: 'tall', last_place: 'Westside Clinic', last_seen_day: DAY }, riverside)
  const tanya = addPerson({ name: 'Tanya Hill', sex: 'female', age: 41, height: 'medium', last_place: 'Westside Clinic', last_seen_day: DAY }, stMarys)

  // Case 4: a person registered under an alias.
  const sister = addPerson({ name: 'Nadia Ferrer', sex: 'female', age: 38, last_place: 'Main Street Church' }, riverside)
  const sisterSearch = addSearch({ shelterId: riverside, searcherPersonId: sister.id,
    target: { name: 'Tomas Ferrer', sex: 'male', age: 45, marks: 'tattoo of an anchor on right arm', last_place: 'Main Street Church', last_seen_day: DAY } })

  // Case 5: someone who will decline contact.
  const victor = addPerson({ name: 'Victor Santos', sex: 'male', age: 40, last_place: 'Harbor Mall' }, riverside)
  const victorSearch = addSearch({ shelterId: riverside, searcherPersonId: victor.id,
    target: { name: 'Maria Santos', sex: 'female', age: 36, last_place: 'Harbor Mall', last_seen_day: DAY } })

  // Case 6: the husband rescued later. Only the wife's open search exists.
  const nora = addPerson({ name: 'Nora Whitaker', sex: 'female', age: 55, last_place: 'Pelican Street' }, harbor)
  const wifeSearch = addSearch({ shelterId: harbor, searcherPersonId: nora.id,
    target: { name: 'Tom Whitaker', sex: 'male', age: 58, last_place: 'Pelican Street', last_seen_day: DAY, marks: 'gray beard' } })

  // Run the first searches while nobody has been registered yet, then register the people sought.
  for (const s of [motherSearch, daughterSearch, sisterSearch, victorSearch, wifeSearch]) runSearch(s)

  const found = (shelterId, data) => matchNewPerson(addPerson(data, shelterId))
  found(riverside, { sex: 'male', age: 8, height: 'short', hair_color: 'brown', marks: 'red backpack', arrival_method: 'bus', moved_by: 'school bus', travelling_with: 'classmates' })
  found(harbor, { name: 'Rosa Delgado', sex: 'female', age: 81, hair_color: 'white', marks: 'wheelchair, hearing aid', languages: 'Spanish', last_place: 'Sunrise Care Home', last_seen_day: DAY, last_seen_part: 'morning', arrival_method: 'agency transfer', moved_by: 'Coastal Care Transport', needs_assistance: true })
  found(stMarys, { name: 'Mr. Blue', name_is_alias: true, sex: 'male', age: 46, marks: 'tattoo of an anchor on right arm', last_place: 'Main Street Church', last_seen_day: DAY, arrival_method: 'own car' })
  found(harbor, { name: 'Maria Santos', sex: 'female', age: 36, hair_color: 'black', last_place: 'Harbor Mall', last_seen_day: DAY, arrival_method: 'bus' })

  // The couple: the second search finds the first, so both shelters get a reciprocal alert.
  runSearch(addSearch({ shelterId: riverside, searcherPersonId: marcus.id, target: { name: 'Tanya Hill', sex: 'female', age: 41, last_place: 'Westside Clinic', last_seen_day: DAY } }))
  runSearch(addSearch({ shelterId: stMarys, searcherPersonId: tanya.id, target: { name: 'Marcus Hill', sex: 'male', age: 44, last_place: 'Westside Clinic', last_seen_day: DAY } }))

  // The sought person at Harbor View has a pending request waiting, ready to be declined live.
  const mariaMatch = db.prepare('SELECT m.* FROM matches m WHERE m.search_id = ? ORDER BY m.score DESC').get(victorSearch.id)
  createRequest({ match: mariaMatch, message: 'Please let me know you are safe.', familyDetail: 'The name of our first dog', photo: null })
}

export function resetDemo() {
  for (const table of ['notifications', 'contact_requests', 'matches', 'searches', 'group_movements', 'people', 'shelters']) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
  for (const file of fs.readdirSync(photoDir)) {
    if (file !== '.gitkeep') fs.rmSync(path.join(photoDir, file), { force: true })
  }
  seed()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetDemo()
  console.log('Demo data created.')
}
