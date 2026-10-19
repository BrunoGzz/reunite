import { useEffect, useState } from 'react'
import { get } from '../api.js'

// A simple list of everyone registered at this shelter.
export default function People() {
  const [people, setPeople] = useState(null)
  const [filter, setFilter] = useState('')

  useEffect(() => { get('/api/people').then(setPeople) }, [])

  if (!people) return null
  const shown = people.filter((p) => (p.name || 'unknown').toLowerCase().includes(filter.toLowerCase()))

  return (
    <>
      <h1>People here</h1>
      <p className="subtitle">Everyone registered at this shelter.</p>

      <input className="search-box" placeholder="Search by name" value={filter} onChange={(e) => setFilter(e.target.value)} />

      {people.length === 0 && <div className="empty">Nobody registered yet. Go to Home and choose "Register a person" to add the first one.</div>}
      {people.length > 0 && (
        <div className="table-card">
          <table>
            <thead><tr><th>Name</th><th>Sex</th><th>Age</th><th>Registered</th></tr></thead>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
