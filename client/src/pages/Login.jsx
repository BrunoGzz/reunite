import { useEffect, useState } from 'react'
import { get, post } from '../api.js'

export default function Login({ onLogin }) {
  const [shelters, setShelters] = useState([])
  const [shelterId, setShelterId] = useState('')
  const [role, setRole] = useState('volunteer')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    get('/api/shelters').then((list) => {
      setShelters(list)
      if (list.length) setShelterId(list[0].id)
    })
  }, [])

  async function submit(e) {
    e.preventDefault()
    try {
      onLogin(await post('/api/login', { shelterId: Number(shelterId), role, password }))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>Reunite</h1>
        <p className="muted">Helping separated families find each other.</p>
        <label>Your shelter
          <select value={shelterId} onChange={(e) => setShelterId(e.target.value)}>
            {shelters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Your role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="volunteer">Volunteer</option>
            <option value="coordinator">Coordinator</option>
          </select>
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn big">Log in</button>
        <p className="muted small">Demo login. Real accounts are not part of this prototype.</p>
      </form>
    </div>
  )
}
