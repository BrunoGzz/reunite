import { useEffect, useState } from 'react'
import { get, post } from '../api.js'

export default function People() {
  const [people, setPeople] = useState(null)
  const [shelters, setShelters] = useState([])
  const [filter, setFilter] = useState('')
  const [soon, setSoon] = useState(false)

  const load = () => get('/api/people').then(setPeople)
  useEffect(() => { load(); get('/api/shelters').then(setShelters) }, [])

  async function setStatus(person, status, transferredToShelterId) {
    await post(`/api/people/${person.id}/status`, { status, transferredToShelterId })
    load()
  }

  if (!people) return null
  const shown = people.filter((p) => (p.name || 'unknown').toLowerCase().includes(filter.toLowerCase()))

  return (
    <>
      <div className="row spread">
        <h1>People here</h1>
        <div>
          <button className="btn secondary" onClick={() => setSoon(true)}>Import paper list</button>
          {soon && <span className="muted soon">Coming soon</span>}
        </div>
      </div>
      <input className="search-box" placeholder="Search by name" value={filter} onChange={(e) => setFilter(e.target.value)} />

      {people.length === 0 && <div className="empty">Nobody registered yet. Use Register to add the first person.</div>}
      {people.length > 0 && (
        <table>
          <thead><tr><th>Name</th><th>Sex</th><th>Age</th><th>Registered</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name || 'Unknown'}
                  {p.name_is_alias ? <span className="tag">Alias</span> : null}
                  {p.is_minor ? <span className="tag">Minor</span> : null}
                  {p.needs_assistance ? <span className="tag">Needs assistance</span> : null}
                </td>
                <td>{p.sex}</td>
                <td>{p.age ?? 'unknown'}</td>
                <td>{new Date(p.created_at).toLocaleString()}</td>
                <td>{p.status === 'transferred' ? `Transferred to ${p.transferred_to}` : p.status}</td>
                <td><div className="small-actions">
                  {p.status === 'present' && (
                    <>
                      <button className="link" onClick={() => setStatus(p, 'left')}>Mark as left</button>
                      <select value="" onChange={(e) => e.target.value && setStatus(p, 'transferred', Number(e.target.value))}>
                        <option value="">Transferred to...</option>
                        {shelters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </>
                  )}
                  {p.status !== 'present' && <button className="link" onClick={() => setStatus(p, 'present')}>Back here</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
