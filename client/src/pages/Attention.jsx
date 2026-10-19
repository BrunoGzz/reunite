import { useNavigate, useOutletContext, Link } from 'react-router-dom'
import { UserSearch, Check, MessageCircleHeart, ChevronRight } from 'lucide-react'
import { post } from '../api.js'

// Everything new for this shelter: matches that were found, and people who want to be in touch.
export default function Attention() {
  const { attention, refresh } = useOutletContext()
  const navigate = useNavigate()

  async function open(alert) {
    await post(`/api/notifications/${alert.id}/read`)
    refresh()
    if (alert.kind === 'match_alert') navigate(`/searches/${alert.search_id}`)
  }

  if (!attention) return null
  const { alerts, pendingRequests, emails } = attention
  const nothing = alerts.length === 0 && pendingRequests === 0

  return (
    <>
      <h1>Needs your attention</h1>
      <p className="subtitle">New matches and people who want to get in touch.</p>

      {nothing && <div className="empty">You are all caught up. New matches and requests will appear here.</div>}

      {pendingRequests > 0 && (
        <Link to="/requests" className="attn-row">
          <span className="attn-icon big"><MessageCircleHeart size={22} /></span>
          <span className="grow"><strong>{pendingRequests === 1 ? '1 person wants' : `${pendingRequests} people want`} to contact someone here.</strong> Show them the request so they can decide.</span>
          <ChevronRight size={20} />
        </Link>
      )}

      {alerts.map((a) => (
        <div className="attn-row" key={a.id}>
          <span className="attn-icon big">{a.kind === 'reunion' ? <Check size={22} /> : <UserSearch size={22} />}</span>
          <span className="grow">{a.text}</span>
          {a.kind === 'reunion'
            ? <button className="btn secondary" onClick={() => open(a)}>Got it</button>
            : <button className="btn" onClick={() => open(a)}>Open</button>}
        </div>
      ))}

      {emails.length > 0 && (
        <>
          <h2>Recent messages</h2>
          {emails.map((e, i) => <p className="muted" key={i}>{e.text}</p>)}
        </>
      )}
    </>
  )
}
