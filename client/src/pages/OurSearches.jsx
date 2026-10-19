import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, CheckCircle2, CircleHelp, UserSearch } from 'lucide-react'

import { get } from '../api.js'
import { Reunion } from '../components/ResultList.jsx'

// A few words about who is being looked for.
function describe(c) {
  const who = [c.sex !== 'unknown' ? c.sex : null, c.age != null ? `${c.age} years old` : null].filter(Boolean).join(', ')
  const parts = [who, c.last_place ? `last seen at ${c.last_place}` : null].filter(Boolean)
  return parts.length ? parts.join(' - ') : 'No other details'
}

// What this search looks like right now, in one of five states.
function stateOf(c) {
  if (c.reunion) return 'reunited'
  if (c.request_sent) return 'sent'
  if (c.match_count > 0) return 'possible'
  return 'none'
}

export default function OurSearches() {
  const [cards, setCards] = useState(null)

  useEffect(() => {
    const load = () => get('/api/searches').then(setCards).catch(() => {})
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  if (!cards) return null

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Our searches</h1>
          <p className="subtitle">Everyone this shelter is looking for, and where each search stands.</p>
        </div>
        <Link className="btn" to="/search">Search for someone</Link>
      </div>

      {cards.length === 0 && <div className="empty">No searches from this shelter yet. Choose "Search for someone" to start one.</div>}
      {cards.map((c) => <SearchCard key={c.id} card={c} />)}
    </>
  )
}

function SearchCard({ card: c }) {
  const navigate = useNavigate()
  const state = stateOf(c)
  const canView = c.match_count > 0 || c.reunion

  return (
    <div className={'search-card' + (c.new_activity ? ' new' : '')}>
      <div className="sc-head">
        <div>
          <div className="sc-title">{c.searcher_name || 'A family member'} (here) is looking for {c.name || 'someone'}{c.also_here ? ' (also here)' : ''}</div>
          <div className="muted">{describe(c)}</div>
        </div>
        {c.new_activity && <span className="tag accent">New</span>}
      </div>

      <div className="sc-body">
        {state === 'none' && <><span className="chip"><CircleHelp size={15} />No matches yet</span><span className="muted">We keep looking and will alert you.</span></>}
        {state === 'possible' && <><span className="chip possible"><UserSearch size={15} />Possible match</span><span className="sc-score"><strong>{c.best_score}%</strong> best match{c.match_count > 1 ? `, ${c.match_count} possible matches` : ''}</span></>}
        {state === 'sent' && <><span className="chip sent"><Clock size={15} />Request sent</span><span className="muted">Pending confirmation.</span><span className="sc-score"><strong>{c.best_score}%</strong> best match</span></>}
        {state === 'reunited' && <span className="chip reunited"><CheckCircle2 size={15} />Reunited</span>}
      </div>

      {c.reunion && (
        <div className="sc-reunion">
          <Reunion reunion={c.reunion} />
          {c.email && <div className="muted small">{c.email}</div>}
        </div>
      )}

      {canView && (
        <div className="sc-actions">
          <button className={'btn' + (c.new_activity ? '' : ' secondary')} onClick={() => navigate(`/searches/${c.id}`)}>View results</button>
        </div>
      )}
    </div>
  )
}
