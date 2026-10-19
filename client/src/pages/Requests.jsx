import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { get } from '../api.js'
import RequestCard from '../components/RequestCard.jsx'

export default function Requests() {
  const { refresh } = useOutletContext()
  const [tab, setTab] = useState('incoming')
  const [data, setData] = useState(null)
  const [decided, setDecided] = useState({}) // decided requests stay on screen, so the result can be read

  useEffect(() => {
    const load = () => get('/api/requests').then(setData).catch(() => {})
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  if (!data) return null
  const incoming = [...data.incoming, ...Object.values(decided).filter((d) => !data.incoming.some((r) => r.id === d.id))]

  return (
    <>
      <h1>Requests</h1>
      <div className="tabs">
        <button className={tab === 'incoming' ? 'on' : ''} onClick={() => setTab('incoming')}>Waiting for you ({data.incoming.length})</button>
        <button className={tab === 'sent' ? 'on' : ''} onClick={() => setTab('sent')}>Sent by us ({data.sent.length})</button>
      </div>

      {tab === 'incoming' && (
        <>
          <p className="notice">Show this screen to the person. They decide.</p>
          {data.incoming.length === 0 && <div className="empty">No requests waiting. When a family asks to contact someone here, it will appear on this page.</div>}
          {incoming.map((r) => <RequestCard key={r.id} request={r} onDecided={() => { setDecided((d) => ({ ...d, [r.id]: r })); refresh() }} />)}
        </>
      )}

      {tab === 'sent' && (
        <>
          {data.sent.length === 0 && <div className="empty">You have not sent any requests. Open a search result and choose "Send contact request".</div>}
          {data.sent.map((r) => (
            <div className="card row" key={r.id}>
              <div className="grow">Request to contact {r.sought_name || 'a person'}</div>
              <span className="status">{r.status === 'accepted' ? 'Accepted. See the search results for details.' : 'Pending confirmation'}</span>
            </div>
          ))}
        </>
      )}
    </>
  )
}
