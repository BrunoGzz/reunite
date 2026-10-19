import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { get, post } from '../api.js'
import RequestCard from '../components/RequestCard.jsx'

export default function Review() {
  const { refresh } = useOutletContext()
  const [queue, setQueue] = useState(null)

  const load = () => get('/api/review').then(setQueue).catch(() => {})

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  async function decide(id, decision) {
    await post(`/api/review/matches/${id}/${decision}`)
    load()
    refresh()
  }

  if (!queue) return null
  const empty = queue.matches.length === 0 && queue.requests.length === 0

  return (
    <>
      <h1>Needs review</h1>
      <p className="subtitle">Possible matches without a name, and requests for children or people who need help deciding.</p>

      {empty && <div className="empty">Nothing to review right now.</div>}

      {queue.matches.map((m) => (
        <div className="card" key={m.id}>
          <div className="row spread">
            <strong>Possible match without a name ({m.score}%)</strong>
          </div>
          <div className="columns">
            <div>
              <div className="muted">Family is looking for</div>
              <div>{m.sought_name || 'Unnamed'}, {m.sought_sex}, age {m.sought_age ?? 'unknown'}</div>
              <div>Last place: {m.sought_place || 'unknown'}</div>
            </div>
            <div>
              <div className="muted">Registered person</div>
              <div>{m.person_name || 'Unnamed'}, {m.person_sex}, age {m.person_age ?? 'unknown'}</div>
              <div>Last place: {m.person_place || 'unknown'}</div>
              <div>Marks: {m.person_marks || 'none noted'}</div>
            </div>
          </div>
          <ul className="reasons">{m.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="row">
            <button className="btn big" onClick={() => decide(m.id, 'approve')}>Approve and alert</button>
            <button className="btn secondary" onClick={() => decide(m.id, 'reject')}>Not a match</button>
          </div>
        </div>
      ))}

      {queue.requests.map((r) => <RequestCard key={r.id} request={r} onDecided={() => { refresh() }} />)}
    </>
  )
}
