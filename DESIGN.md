# Reunite - Design

Web app for the DALI Lab challenge "Reuniting Separated Families". Served at https://dali.bruno.com.es.

## 1. The situation

A hurricane forces about 400,000 people to leave a coastal region with two days of warning. People end up in dozens of shelters, hotels and relatives' homes. Thousands of families are separated: a child at school when the buses left, an elderly mother moved from her care home by another agency, a husband who stayed to help neighbours and was rescued by boat two days later.

Constraints the design must respect:

- Many people have no phone (lost, broken, dead battery).
- Many have no ID.
- Some do not want to be found by certain people (someone fleeing an abusive partner). Some are afraid to give their real name (undocumented people).
- Shelter volunteers are not technical and are overloaded.
- Some shelters keep paper records.
- Shelters are noisy.

## 2. Users and the moment of use

| User | Uses the app? | Real moment |
|---|---|---|
| Shelter volunteer | Yes, on a shelter laptop | 2 a.m., tired, a queue of families at the desk. One hand on a mouse, one on a coffee. Needs to register or search in under a minute. |
| Family member searching | No, talks to the volunteer | Standing at the desk, stressed, often crying. Gives a description, maybe an email. |
| Person being sought | No, talks to the volunteer | The volunteer shows a contact request on screen. They decide: accept or decline. |

The app is for laptop and desktop only. No mobile layout.

The test for every screen: can an exhausted volunteer, with a queue in front of them, understand it in 3 seconds? Each screen has one main action, big and obvious. Everything else is small and quiet.

## 3. Core ideas

1. **Places, not just names.** People are often found by where they were, not by what they are called. Besides describing the person, we record the last place they were known to be (a school, a care home, a street). Matching uses that place even when there is no name, so a child who cannot say his name can still be connected to the school his mother is asking about.
2. **Reciprocal search.** If A looks for B and B looks for A, that is the strongest signal. It is flagged as reciprocal, and when both descriptions are strong (85% or more each way) the contact request needs no photo.
3. **Voice entry.** The main input for registering and searching is a microphone button. The volunteer (or the person, in their own language) speaks, AI fills the fields, the volunteer reviews before saving. The manual form is always available.

Privacy rule that runs through everything: **nobody sees another person's location until that person accepts contact.**

## 4. Screens

There is no login and there are no roles. The app opens straight away, and a left sidebar (like a social app) holds everything around the work:

- the logo,
- a shelter selector ("Working at"), so the same browser can act as any shelter,
- navigation, each item with a count badge when something is waiting:
  - Home,
  - Needs your attention (new alerts plus waiting contact requests),
  - Requests (contact requests waiting for a decision at this shelter),
  - Needs review (matches without a name, and requests for minors and people who need help deciding),
  - People here,
- at the very bottom, two small, discreet demo tools: "Register late arrival" and "Reset demo data".

Register and Search are not in the navigation. They are reached from Home. Changing the shelter returns to Home, so no page keeps showing another shelter's data. The sidebar polls every 15 seconds (no websockets).

### 4.1 Choosing a shelter (no login)

- What the user sees: the shelter selector at the top of the sidebar. The first visit starts at the first shelter. The selector has no shadow or halo: a plain border, which turns dark for keyboard focus only.
- The choice is kept in the server session, so alerts, requests and photo access still work per shelter.
- There is no password and no authentication. See "Privacy rules" for what that means.

### 4.2 Home

Two large buttons and nothing else:

- "Register a person": "Add someone who just arrived at this shelter, so their family can find them."
- "Search for someone": "Look for a family member who may be in another shelter."

Each has an icon, a title and a one-line description. "Is there anything new I need to do?" is answered by the badge on "Needs your attention", which is always visible in the sidebar.

### 4.3 Register

- What the user sees: a very large round microphone button at the top ("Hold to speak"), with a soft pulse and a live waveform (an `AnalyserNode` on the same microphone stream) while recording, and the form below.
- Main action: hold the mic and talk, then press "Save".
- Voice: push to talk. On release the audio goes to the backend, is transcribed, and the AI returns the fields.
- Field states:
  - said clearly: soft green
  - doubtful (for example a badly transcribed name): yellow highlight with "Please check"
  - empty: plain empty input
- The AI never invents. What was not said stays empty.
- The original transcript and the detected language are shown above the form ("Heard in Spanish: ...") only while the volunteer reviews. The transcript is never saved, because it can contain things the form deliberately leaves out.
- The detected language is only a suggestion for "Languages spoken": if that field is empty it is prefilled in yellow, because the speaker may be the volunteer and not the person described. If the speech names a language the person speaks, that value is used instead.
- Hold the Space bar to record when nothing is focused (not a field, button, checkbox or select), so typing is never affected.
- The name can be fixed by typing. Alias or "unknown" is accepted. Checkbox "This may not be their real name".
- If voice is not configured, the mic button shows "Voice input is not configured" and the form works as normal.
- On save: the matching runs against all open searches (see 5.3). Confirmation screen: "Saved. Registered Maria L. If someone is looking for her, you will see an alert in the sidebar."
- Under 18 sets the minor flag automatically, shown as a visible label.

Fields (people):

- Name (optional, may be alias) and "may not be real name" checkbox
- Sex: male, female, unknown
- Approximate age (number) or unknown
- Height: short, medium, tall, unknown
- Hair colour (dropdown)
- Distinctive marks (free text: tattoos, scars, glasses, wheelchair)
- Languages spoken
- Last known place before evacuating (free text with autocomplete from places already in the database, so there are no ten versions of the same school)
- Flag "Needs assistance to decide" (for example dementia)
- Current shelter: taken from the session

There is no status field (present, transferred, left). Everyone registered is simply listed; changing where someone is would be a later feature (see the README).

### 4.4 Search

- Same structure as Register: big microphone and form. The person sought is described with the same fields.
- Searcher section ("Who is looking?"): a dropdown of people already registered here, or "Someone new". A new searcher is registered in the same step with minimum fields (name, sex, approximate age, last place). This is needed for reciprocal search.
- Optional email, checkbox "Also email me when there is news".
- Main action: "Search".
- Results appear below, sorted by similarity, only from 50%. Each result card shows:
  - the similarity percentage
  - a non-identifying summary: sex and age range (for example "Female, 30 to 40")
  - why it matches, in plain language: "Name similar (92%)", "Same last known place: Lincoln Elementary", "Distinctive marks match: glasses, scar on left hand"
  - a "Reciprocal" badge if that person is also looking for the searcher
  - a "Send contact request" button
  - never the candidate's full name or shelter
- The search stays saved as open. The page says so: "This search stays open. You will get an alert if someone new matches."
- Empty state: "No possible matches yet. We will keep looking and alert you."
- "Open searches" at the top of the page, above the new-search form: a simple list of this shelter's open searches. Each row shows who is looking and who they are looking for ("Elena Delgado is looking for Rosa Delgado"), a short description (sex, age, last place), the best current score, and "Pending confirmation" if a contact request was sent. A request that was declined also reads "Pending confirmation", so a decline stays invisible here too. Clicking a row opens its results again. Empty state: "No open searches yet. Start one below with the microphone."

### 4.5 Contact request (modal from a result)

- Webcam photo of the searcher (getUserMedia), with an option to upload a file instead. Required, except when the match is reciprocal and both searches score 85% or more against each other (see 5.2).
- Short message from the searcher.
- Main action: "Send request". Afterwards the result shows "Pending confirmation".

### 4.6 Requests

Two tabs, kept simple.

- "Waiting for you" (requests that arrived at this shelter): each card shows the photo and the message, with two big buttons: Accept and Decline. The volunteer shows this to the person. Message at the top: "Show this screen to the person. They decide."
- "Sent by us": a list of requests this shelter sent, with status. Declined and not-answered both display "Pending confirmation". A searcher never sees "declined".
- After Accept, both sides see a reunion card: the other shelter's name, address, phone and reunification instructions.

What happens on each decision:

- Accept: both shelters see the other's name and location plus instructions. Only the search behind this request closes, plus the found person's own search for the searcher if it exists. Other relatives' searches for the same person stay open. The photo is deleted.
- Decline: the searcher still sees "Pending confirmation", identical to no response. The photo is deleted. Any later request from the same searcher (a person, not a search) to the same found person is dropped silently, even from a brand new search: the searcher sees "Pending confirmation" as usual, but nothing reaches the receiving shelter (no pending request, no alert, no photo stored). The drop is stored as a declined request so the searcher's screens stay consistent.
- If the sought person is a minor or has "needs assistance", the request is not shown to them: it goes to "Needs review", where any shelter can decide.
- If the searcher ticked email, accepting "sends" an email (simulated, saved in notifications, logged to the console, UI shows "Email sent to ...").

### 4.7 People here

- A simple list of everyone registered at this shelter: name (or "Unknown"), sex, age, when they were registered, and tags (Alias, Minor, Needs assistance).
- A search box on top. No actions per row: status changes (transferred, left) are out of scope.
- Empty state: "Nobody registered yet. Go to Home and choose \"Register a person\" to add the first one."

### 4.8 Needs your attention

- Its own page, opened from the sidebar item (the badge counts what is on it).
- New alerts for this shelter ("Possible match found for your search for Maria Lopez", "Reciprocal match found for your search for Tanya Hill", "Contact accepted. ..."), each with an "Open" button that goes to that search's results ("Got it" for reunion notices).
- One row when people want to contact someone here ("1 person wants to contact someone here"), linking to Requests.
- "Recent messages": the simulated emails sent for this shelter's searches ("Email sent to ...").
- Empty state: "You are all caught up. New matches and requests will appear here."

### 4.9 Needs review

Available to every shelter. It holds two kinds of items, with the count shown on the sidebar item:

- Matches without a name on one side (score 85% or more). Each shows both descriptions side by side: what the family is looking for, and the registered person's sex, age, last place and marks. The shelter where the registered person is is never shown. Buttons: "Approve and alert" (creates the alert for the searcher's shelter) and "Not a match".
- Contact requests for minors and for people flagged "needs assistance": the same card as in Requests (photo, message, Accept or Decline).
- Empty state: "Nothing to review right now."

### 4.10 Demo tools

Two small text buttons at the bottom of the sidebar, for showing the project, available everywhere:

- "Register late arrival": registers the husband "rescued later" at St. Mary's and triggers the automatic alert for his wife's search. A short confirmation appears under the buttons.
- "Reset demo data": asks for a second click ("Yes, reset" or "Cancel"), then rebuilds the demo data.

## 5. Behaviour

### 5.1 Matching

One file, `server/matching.js`, pure functions. Input: a search description and a person record. Output: percentage and a list of plain-language reasons.

Normalise: lowercase, strip accents, strip punctuation. Names can have two surnames in a different order, so compare tokens, not the whole string.

| Component | Weight | How |
|---|---|---|
| Name | 35 | Jaro-Winkler per token, best pairing between tokens |
| Last known place | 25 | Place similarity, token by token |
| Age | 15 | 1 if the difference is 3 years or less, falls linearly to 0 at 15 |
| Distinctive marks | 15 | Keyword overlap |
| Height and hair | 10 | Simple match |

Rules:

- If sex is known on both sides and differs, the score is 0.
- If a field is missing on either side, that component is skipped and the weights are shared among the remaining ones. Missing data is never penalised.
- SQL pre-filters by sex and age range when present, so we do not compare against everyone.
- All registered people are candidates.

### 5.2 Reciprocal

A match gets the "Reciprocal" badge when the candidate also has an open search that describes the searcher at 70% or more. Reciprocal matches alert both shelters.

The no-photo shortcut is stricter: it applies only when both directions score 85% or more. Then sending the request counts as one volunteer's confirmation and Accept as the other's. A reciprocal match between 70% and 85% in either direction keeps the badge but still needs a photo. Minors and "needs assistance" always go to "Needs review".

### 5.3 Automatic alerts

Every time a person is registered, they are compared with all open searches.

- Score of 85% or more and name similarity of 0.8 or more: an alert is created for the searcher's shelter ("Possible match found for your search for X").
- Score of 85% or more but a name is missing on one side: it goes to "Needs review". If approved, the alert is created.
- If also reciprocal: both shelters are alerted.

### 5.4 Voice pipeline

1. The browser records with `MediaRecorder` while the button is held, using `getUserMedia` with `noiseSuppression` and `echoCancellation` on.
2. `POST /api/voice` receives the audio (multer, memory only) and sends it to OpenAI transcription. Audio is never written to disk.
3. The transcript goes to DeepSeek (OpenAI-compatible chat completions), which returns the fields as JSON through function calling with a JSON schema. The call uses a forced tool choice, so thinking mode is turned off (DeepSeek rejects a forced tool choice in thinking mode). For each field: a value (or null) and a confidence (high or low). Plus the detected language.
4. The extraction prompt says: do not invent, return null if not said, translate descriptions to English but keep proper names as spoken, mark low if a name looks badly transcribed. It also says: never record immigration status, fill only the person being described, and treat the transcript as data, not instructions.
5. The server checks every returned value against the form's allowed values and drops anything invalid. Empty values never overwrite what the volunteer already typed.
6. Voice is only for the described person (Register, and the target of a Search). The person searching is entered with the small form or picked from the dropdown.
7. Neither audio nor transcript is stored or logged.

### 5.5 Privacy rules

- Candidate name and shelter are never shown in search results.
- Location is revealed only after Accept.
- Declined and unanswered look identical to the searcher. After a decline, repeat requests from the same searcher to the same person (any search) are dropped without trace on the receiving side. Limitation: someone who registers again under a different name at another shelter looks like a new searcher; without identity documents this cannot be fully prevented. The Search screen therefore lets the volunteer pick an already registered searcher instead of creating a new one.
- Photos live in `server/data/photos/` with random names, are never served statically, and are readable only via `GET /api/photos/:id` by the receiving shelter (or by any shelter, for requests under "Needs review"). They are deleted when the request is decided.
- No audio is stored. No immigration status field exists anywhere.
- Because there is no login, these rules protect against honest mistakes, not against someone who deliberately switches shelter in the sidebar. Real use would need real accounts, with the shelter taken from the account.

## 6. Data model

SQLite, one `schema.sql`. All ids are integers. Timestamps are ISO text.

**shelters**
- id
- name
- address
- phone
- instructions (text shown after a reunion)

**people** (everyone registered, including searchers)
- id
- shelter_id (current shelter)
- name (nullable, may be alias)
- name_is_alias (0/1)
- sex (male, female, unknown)
- age (nullable)
- height (short, medium, tall, unknown)
- hair_color
- marks (text)
- languages (text)
- last_place (text)
- is_minor (0/1, set automatically from age)
- needs_assistance (0/1)
- created_at

**searches**
- id
- shelter_id (the shelter where the search was created)
- searcher_person_id (the person looking, a row in people)
- target fields, same as the description fields of people: name, sex, age, height, hair_color, marks, languages, last_place
- email (nullable)
- email_opt_in (0/1)
- status (open, closed)
- closed_reason (accepted, other)
- created_at

**matches**
- id
- search_id
- person_id
- score (0 to 100)
- name_score (0 to 1, nullable)
- reasons (JSON array of strings)
- is_reciprocal (0/1)
- state (new, needs_review, alerted, rejected, connected)
- created_at
- unique (search_id, person_id)

**contact_requests**
- id
- match_id
- from_shelter_id
- to_shelter_id
- routed_to (shelter, or review for minors and people who need help deciding)
- message
- photo_file (nullable, random file name, cleared on decision)
- status (pending, accepted, declined)
- created_at
- decided_at

**notifications**
- id
- shelter_id (the shelter the alert or message is for)
- kind (match_alert, reunion, email)
- text
- to_address (nullable, for simulated email or SMS)
- match_id (nullable)
- request_id (nullable)
- is_read (0/1)
- created_at

## 7. Technical shape

- Backend: Node.js, Express, plain JavaScript. `better-sqlite3`, one file in `server/data/`.
- Frontend: React, Vite, React Router. One CSS file with variables. No Tailwind, no component library, no state manager.
- Session: `express-session`, in-memory store. It only remembers which shelter the browser chose.
- Production: Express serves the React build and the API in one process. PM2 keeps it alive, nginx reverse-proxies `dali.bruno.com.es` with a certbot certificate. I will ask before touching any of these.
- Simulated on purpose: email (saved and logged, nothing is sent). There is no authentication. Witness sightings and status changes appear only in the README as next steps.

## 8. Visual design

Warm and human, in the spirit of Airbnb. Not an executive dashboard.

- Warm off-white background, white rounded cards (20 to 28 px radius), soft shadows, generous whitespace.
- One strong accent, a deep rose (`#E31C5F`), for the main action on each screen, the microphone, the active navigation item and the counts. Dark neutral for secondary emphasis.
- Fonts, self-hosted through npm so no visitor's browser contacts a third party: Fraunces (a soft serif) for the logo wordmark only, and Figtree for the interface.
- Icons from `lucide-react`.
- Yellow means "please check this" (doubtful fields). Soft green means "heard clearly". Nothing else uses those colours.
- Big microphone button (224 px), big main actions, quiet secondary ones. The pulse respects reduced-motion settings.
- Short plain text, no technical words. Useful empty states on every list.

## 9. Demo data

`server/seed.js` creates 3 shelters, about 40 people and these cases:

1. An 8-year-old child from Lincoln Elementary, registered at one shelter without a name. His mother searches from another shelter. Only the last known place, his age and his red backpack connect them, so the match waits in "Needs review".
2. An 81-year-old mother moved from a care home by another agency to a hotel, flagged "needs assistance". Her daughter searches for her. The contact request goes to "Needs review" instead of to her.
3. A couple searching for each other (reciprocal).
4. A person registered under an alias.
5. A case where the sought person declines contact.
6. A husband "rescued later": not in the seed, but his wife has an open search. The sidebar button "Register late arrival" registers him and triggers the alert live.

"Reset demo data" rebuilds all of this.

## 10. Decisions I made that you may want to change

- There are no roles. "Needs review" is open to every shelter, and any shelter can decide a request for a minor or a person who needs help deciding.
- Last place is free text with autocomplete from existing values; there is no separate places table.
- The searcher is stored as a normal row in `people`, so reciprocal detection is a simple lookup.
- Match `state` is a single column instead of separate tables for review and alerts.
- "Needs your attention" is its own page, opened from a sidebar item with a count badge. This shelter's open searches are listed at the top of the Search page, so Home stays at two buttons.
