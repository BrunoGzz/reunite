import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { get } from '../api.js'
import RequestCard from '../components/RequestCard.jsx'
import { Reunion } from '../components/ResultList.jsx'

// Families asking about people registered at this shelter. The person decides.
export default function Incoming() {
  const { refresh } = useOutletContext()
  const [data, setData] = useState(null)
  const [decided, setDecided] = useState({}) // decided requests stay on screen, so the result can be read

  useEffect(() => {
    const load = () => get('/api/incoming').then(setData).catch(() => {})
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  if (!data) return null
  const pending = [...data.pending, ...Object.values(decided).filter((d) => !data.pending.some((r) => r.id === d.id))]
  const shown = new Set(pending.map((r) => r.id))
  const accepted = data.accepted.filter((r) => !shown.has(r.id))

  return (
    <>
      <h1>Looking for people here</h1>
      <p className="subtitle">Families asking about people registered at this shelter. Show the request to the person: they decide.</p>

      {pending.length === 0 && accepted.length === 0 && <div className="empty">No one is looking for people here right now. When a family asks about someone registered at this shelter, it will appear on this page.</div>}

      {pending.map((r) => <RequestCard key={r.id} here request={r} onDecided={() => { setDecided((d) => ({ ...d, [r.id]: r })); refresh() }} />)}

      {accepted.length > 0 && (
        <>
          <h2>Accepted</h2>
          {accepted.map((r) => (
            <div className="card" key={r.id}>
              <div className="summary">{r.sender_here ? `${r.searcher_name || 'Someone'} (here) was looking for ${r.person_name || 'a person'} (also here)` : `Someone was looking for ${r.person_name || 'a person'} (here)`}</div>
              <Reunion reunion={r.reunion} receiver />
            </div>
          ))}
        </>
      )}
    </>
  )
}
