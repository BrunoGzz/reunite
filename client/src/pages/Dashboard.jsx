import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { get, post } from '../api.js'

export default function Dashboard() {
  const { dashboard, refresh } = useOutletContext()
  const [searches, setSearches] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const load = () => get('/api/searches').then(setSearches).catch(() => {})
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  async function open(alert) {
    await post(`/api/notifications/${alert.id}/read`)
    refresh()
    if (alert.kind === 'review_needed') navigate('/coordinator')
    else if (alert.kind === 'match_alert') navigate(`/searches/${alert.search_id}`)
  }

  const alerts = dashboard ? dashboard.alerts : []
  const waiting = dashboard ? dashboard.pendingRequests : 0
  const nothing = dashboard && alerts.length === 0 && waiting === 0

  return (
    <>
      <div className="row spread">
        <h1>Dashboard</h1>
        <div className="row">
          <Link className="btn big" to="/register">Register someone</Link>
          <Link className="btn big secondary" to="/search">Search for someone</Link>
        </div>
      </div>

      <h2>Needs your attention</h2>
      {nothing && <div className="empty">Nothing needs your attention. Register someone or start a search with the microphone.</div>}
      {waiting > 0 && (
        <div className="card attention">
          <div className="grow"><strong>{waiting === 1 ? '1 person wants' : `${waiting} people want`} to contact someone here.</strong> Show them the request so they can decide.</div>
          <Link className="btn" to="/requests">Open requests</Link>
        </div>
      )}
      {alerts.map((a) => (
        <div className="card attention" key={a.id}>
          <div className="grow">{a.text}</div>
          {a.kind === 'reunion'
            ? <button className="btn secondary" onClick={() => open(a)}>Got it</button>
            : <button className="btn" onClick={() => open(a)}>Open</button>}
        </div>
      ))}

      <h2>Open searches from this shelter</h2>
      {searches && searches.length === 0 && <div className="empty">No open searches yet. Start one with the microphone.</div>}
      {searches && searches.map((s) => (
        <Link to={`/searches/${s.id}`} className="card row-link" key={s.id}>
          <div className="grow">
            <strong>{s.name || 'Unnamed person'}</strong>
            <span className="muted"> searched by {s.searcher_name || 'a family member'}</span>
          </div>
          <span className="muted">{s.match_count === 0 ? 'No matches yet' : `${s.match_count} possible ${s.match_count === 1 ? 'match' : 'matches'}`}</span>
        </Link>
      ))}

      {dashboard && dashboard.emails.length > 0 && (
        <>
          <h2>Recent messages</h2>
          {dashboard.emails.map((e, i) => <p className="muted" key={i}>{e.text}</p>)}
        </>
      )}
    </>
  )
}
