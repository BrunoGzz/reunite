import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { get, post } from '../api.js'
import RequestCard from '../components/RequestCard.jsx'
import { PlaceInput } from '../components/PersonForm.jsx'

export default function Coordinator() {
  const { refresh } = useOutletContext()
  const [queue, setQueue] = useState(null)
  const [requests, setRequests] = useState(null)
  const [movements, setMovements] = useState(null)
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  function load() {
    get('/api/coordinator/queue').then(setQueue)
    get('/api/requests').then((r) => setRequests(r.incoming.filter((x) => x.routed_to === 'coordinator')))
    get('/api/coordinator/movements').then(setMovements)
    refresh()
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  async function review(id, decision) {
    await post(`/api/coordinator/matches/${id}/${decision}`)
    load()
  }

  async function lateArrival() {
    await post('/api/coordinator/demo/late-arrival')
    setNote('Tom Whitaker was registered at St. Mary\'s. His wife\'s shelter (Harbor View Hotel) will see an alert in its sidebar within 15 seconds.')
    load()
  }

  async function reset() {
    await post('/api/coordinator/demo/reset')
    setConfirmReset(false)
    setNote('Demo data was reset.')
    load()
  }

  if (!queue || !requests || !movements) return null

  return (
    <>
      <h1>Coordinator</h1>

      <h2>Needs your decision</h2>
      {queue.reviews.length === 0 && requests.length === 0 && <div className="empty">Nothing to review. Doubtful matches and requests for minors will appear here.</div>}

      {queue.reviews.map((r) => (
        <div className="card" key={r.id}>
          <div className="row spread">
            <strong>Possible match without a name ({r.score}%)</strong>
            <span className="muted">Review before anyone is told</span>
          </div>
          <div className="columns">
            <div>
              <div className="muted">Family is looking for</div>
              <div>{r.sought_name || 'Unnamed'}, {r.sought_sex}, age {r.sought_age ?? 'unknown'}</div>
              <div>Last place: {r.sought_place || 'unknown'}</div>
            </div>
            <div>
              <div className="muted">Registered at {r.person_shelter}</div>
              <div>{r.person_name || 'Unnamed'}, {r.person_sex}, age {r.person_age ?? 'unknown'}</div>
              <div>Marks: {r.person_marks || 'none noted'}</div>
            </div>
          </div>
          <ul className="reasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="row">
            <button className="btn big" onClick={() => review(r.id, 'approve')}>Approve and alert</button>
            <button className="btn secondary" onClick={() => review(r.id, 'reject')}>Not a match</button>
          </div>
        </div>
      ))}

      {requests.map((r) => <RequestCard key={r.id} request={r} onDecided={refresh} />)}

      <div className="row spread">
        <h2>Group transfers</h2>
        <button className="btn secondary" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add group transfer'}</button>
      </div>
      {adding && <MovementForm onSaved={() => { setAdding(false); load() }} />}
      {movements.length === 0 && !adding && <div className="empty">No group transfers yet. Add buses, boats or care home moves so the system can use them.</div>}
      {movements.length > 0 && (
        <table>
          <thead><tr><th>From</th><th>When</th><th>How</th><th>To</th><th>Notes</th></tr></thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{m.origin_place}</td>
                <td>{m.departed_day || 'unknown'} {m.departed_part || ''}</td>
                <td>{[m.transport, m.agency].filter(Boolean).join(', ')}</td>
                <td>{m.destination}</td>
                <td>{m.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Demo tools</h2>
      <div className="card">
        <p className="muted">For showing the project. These are not part of real use.</p>
        <div className="row">
          <button className="btn secondary" onClick={lateArrival}>Demo: register late arrival</button>
          {!confirmReset && <button className="btn secondary" onClick={() => setConfirmReset(true)}>Reset demo data</button>}
          {confirmReset && (
            <>
              <button className="btn" onClick={reset}>Yes, erase everything and reset</button>
              <button className="btn secondary" onClick={() => setConfirmReset(false)}>Cancel</button>
            </>
          )}
        </div>
        {note && <p className="notice">{note}</p>}
      </div>
    </>
  )
}

function MovementForm({ onSaved }) {
  const [shelters, setShelters] = useState([])
  const [form, setForm] = useState({ origin_place: '', departed_day: '', departed_part: '', transport: 'bus', agency: '', destination_shelter_id: '', notes: '', names: '' })
  const [error, setError] = useState('')
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  useEffect(() => { get('/api/shelters').then(setShelters) }, [])

  async function save() {
    try {
      await post('/api/coordinator/movements', { ...form, destination_shelter_id: Number(form.destination_shelter_id) || null })
      onSaved()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="card">
      <div className="row">
        <PlaceInput className="field grow" label="Where did they leave from?" value={form.origin_place} onChange={(v) => setForm({ ...form, origin_place: v })} />
        <label className="field">Day<input type="date" value={form.departed_day} onChange={set('departed_day')} /></label>
        <label className="field">Time of day
          <select value={form.departed_part} onChange={set('departed_part')}>
            <option value="">Unknown</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option><option value="night">Night</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field">Transport
          <select value={form.transport} onChange={set('transport')}>
            {['bus', 'boat', 'ambulance', 'agency transfer', 'other'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="field grow">Agency<input value={form.agency} onChange={set('agency')} /></label>
        <label className="field grow">Where did they go?
          <select value={form.destination_shelter_id} onChange={set('destination_shelter_id')}>
            <option value="">Choose a shelter</option>
            {shelters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Notes<input value={form.notes} onChange={set('notes')} /></label>
      <label className="field">Names, if known (optional)<textarea rows="2" value={form.names} onChange={set('names')} /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn big" onClick={save}>Save transfer</button>
    </div>
  )
}
