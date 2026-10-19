import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { get, post } from '../api.js'
import RequestCard from '../components/RequestCard.jsx'
import { Reunion } from '../components/ResultList.jsx'

// Everything other shelters started about people registered at this shelter, and that only this shelter sees:
// requests to contact someone, and possible matches that need confirming.
export default function Incoming() {
  const { refresh } = useOutletContext()
  const [data, setData] = useState(null)
  const [decided, setDecided] = useState({}) // decided items stay on screen, so the result can be read
  const [handled, setHandled] = useState({})

  const load = () => get('/api/incoming').then(setData).catch(() => {})

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  if (!data) return null
  const pending = [...data.pending, ...Object.values(decided).filter((d) => !data.pending.some((r) => r.id === d.id))]
  const toConfirm = [...data.toConfirm, ...Object.values(handled).filter((h) => !data.toConfirm.some((m) => m.id === h.id))]
  const shown = new Set(pending.map((r) => r.id))
  const accepted = data.accepted.filter((r) => !shown.has(r.id))

  return (
    <>
      <h1>Looking for people here</h1>
      <p className="subtitle">Families asking about people registered at this shelter. Show a request to the person: they decide. For a child or someone who cannot decide alone, staff decides.</p>

      {pending.length === 0 && toConfirm.length === 0 && accepted.length === 0 && <div className="empty">No one is looking for people here right now. When a family asks about someone registered at this shelter, it will appear on this page.</div>}

      {pending.map((r) => <RequestCard key={r.id} here request={r} onDecided={() => { setDecided((d) => ({ ...d, [r.id]: r })); refresh() }} />)}
      {toConfirm.map((m) => <ConfirmCard key={m.id} match={m} onDone={() => { setHandled((h) => ({ ...h, [m.id]: m })); load(); refresh() }} />)}

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

// A strong match where a name is missing. Only this shelter can tell, because the person is registered here.
function ConfirmCard({ match: m, onDone }) {
  const [done, setDone] = useState(null)

  async function act(kind) {
    await post(`/api/matches/${m.id}/${kind}`)
    setDone(kind)
    onDone()
  }

  const savesName = !m.person_name && m.sought_name
  if (done) return <div className="card"><p>{done === 'confirm' ? `Confirmed. ${savesName ? `The name ${m.sought_name} was saved on this person's record. ` : ''}The family has been alerted.` : 'Dismissed. Nobody was told.'}</p></div>

  return (
    <div className="card">
      <div className="summary">Possible match to confirm ({m.score}%)</div>
      {m.sought_name && <div className="may-be">May be: <strong>{m.sought_name}</strong></div>}
      <p className="muted">Someone describes a person who may be registered here. Check {m.sought_name ? 'the name with the person' : 'it against what you know'}.</p>
      <div className="columns">
        <div>
          <div className="muted">The family describes</div>
          <div>{m.sought_sex}, age {m.sought_age ?? 'unknown'}</div>
          <div>Last place: {m.sought_place || 'unknown'}</div>
        </div>
        <div>
          <div className="muted">Registered here</div>
          <div>{m.person_name || 'Unnamed'}, {m.person_sex}, age {m.person_age ?? 'unknown'}</div>
          <div>Last place: {m.person_place || 'unknown'}</div>
          <div>Marks: {m.person_marks || 'none noted'}</div>
        </div>
      </div>
      <ul className="reasons">{m.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="row">
        <button className="btn big" onClick={() => act('confirm')}>Confirm</button>
        <button className="btn secondary" onClick={() => act('dismiss')}>Dismiss</button>
      </div>
    </div>
  )
}
