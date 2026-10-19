import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, ChevronRight } from 'lucide-react'
import { get } from '../api.js'

// Who is being looked for, in a few words, without anything the results do not already show.
function describe(s) {
  const who = [s.sex !== 'unknown' ? s.sex : null, s.age != null ? `${s.age} years old` : null].filter(Boolean).join(', ')
  const parts = [who, s.last_place ? `last seen at ${s.last_place}` : null].filter(Boolean)
  return parts.length ? parts.join(' - ') : 'No other details'
}

// This shelter's open searches. Clicking one opens its results again.
export default function OpenSearches() {
  const [searches, setSearches] = useState(null)

  useEffect(() => {
    const load = () => get('/api/searches').then(setSearches).catch(() => {})
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  if (!searches) return null

  return (
    <section className="open-searches">
      <h2>Open searches</h2>
      {searches.length === 0 && <div className="empty">No open searches yet. Start one below with the microphone.</div>}
      {searches.map((s) => (
        <Link to={`/searches/${s.id}`} className="open-search" key={s.id}>
          <div className="open-main">
            <div className="open-title">{s.searcher_name || 'A family member'} is looking for {s.name || 'someone'}</div>
            <div className="muted">{describe(s)}</div>
          </div>
          <div className="open-side">
            {s.request_sent && <span className="status"><Clock size={16} />Pending confirmation</span>}
            {s.best_score != null
              ? <span className="open-score"><strong>{s.best_score}%</strong> best match</span>
              : <span className="muted">No matches yet</span>}
          </div>
          <ChevronRight size={20} className="muted" />
        </Link>
      ))}
    </section>
  )
}
