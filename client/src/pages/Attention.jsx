import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { UserSearch, Check } from 'lucide-react'
import { get, post } from '../api.js'
import RequestCard from '../components/RequestCard.jsx'

// Everything that needs a person: new matches and reunions for this shelter, and the review queue.
export default function Attention() {
  const { attention, refresh } = useOutletContext()
  const [queue, setQueue] = useState(null)
  const [decided, setDecided] = useState({}) // decided requests stay on screen, so the result can be read
  const navigate = useNavigate()

  const loadQueue = () => get('/api/review').then(setQueue).catch(() => {})

  useEffect(() => {
    loadQueue()
    const timer = setInterval(loadQueue, 15000)
    return () => clearInterval(timer)
  }, [])

  async function open(alert) {
    await post(`/api/notifications/${alert.id}/read`)
    refresh()
    if (alert.kind === 'match_alert') navigate(`/searches/${alert.search_id}`)
  }

  async function decide(id, decision) {
    await post(`/api/review/matches/${id}/${decision}`)
    loadQueue()
    refresh()
  }

  if (!attention || !queue) return null
  const { alerts, emails } = attention
  const requests = [...queue.requests, ...Object.values(decided).filter((d) => !queue.requests.some((r) => r.id === d.id))]
  const toReview = queue.matches.length + queue.requests.length

  return (
    <>
      <h1>Needs attention</h1>
      <p className="subtitle">New matches, and items that need a second look.</p>

      {alerts.length === 0 && toReview === 0 && <div className="empty">You are all caught up. New matches and items to review will appear here.</div>}

      {alerts.map((a) => (
        <div className="attn-row" key={a.id}>
          <span className="attn-icon big">{a.kind === 'reunion' ? <Check size={22} /> : <UserSearch size={22} />}</span>
          <span className="grow">{a.text}</span>
          {a.kind === 'reunion'
            ? <button className="btn secondary" onClick={() => open(a)}>Got it</button>
            : <button className="btn" onClick={() => open(a)}>Open</button>}
        </div>
      ))}

      {toReview > 0 && (
        <>
          <h2>To review</h2>
          <p className="muted">Possible matches without a name, and requests for children or people who need help deciding.</p>
        </>
      )}

      {queue.matches.map((m) => (
        <div className="card" key={m.id}>
          <strong>Possible match without a name ({m.score}%)</strong>
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

      {requests.map((r) => <RequestCard key={r.id} request={r} onDecided={() => { setDecided((d) => ({ ...d, [r.id]: r })); loadQueue(); refresh() }} />)}

      {emails.length > 0 && (
        <>
          <h2>Recent messages</h2>
          {emails.map((e, i) => <p className="muted" key={i}>{e.text}</p>)}
        </>
      )}
    </>
  )
}
