import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Search, UserSearch, Users, Building2, ChevronDown } from 'lucide-react'
import { post } from '../api.js'
import Logo from './Logo.jsx'

export default function Sidebar({ me, shelters, onChoose, badges, refresh }) {
  const b = badges || { searches: 0, incoming: 0, people: 0 }
  const count = (n) => n > 0 && <span className="count">{n}</span>

  return (
    <aside className="sidebar">
      <Logo />

      <div className="switcher">
        <label className="switcher-label" htmlFor="shelter-select">Working at</label>
        <div className="select-wrap">
          <Building2 size={18} />
          <select id="shelter-select" value={me.shelterId} onChange={(e) => onChoose(Number(e.target.value))}>
            {shelters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ChevronDown size={18} className="select-chevron" aria-hidden="true" />
        </div>
      </div>

      <nav className="nav">
        <NavLink to="/" end><Home size={20} />Home</NavLink>
        <NavLink to="/searches"><Search size={20} />Our searches{count(b.searches)}</NavLink>
        <NavLink to="/incoming"><UserSearch size={20} />Looking for people here{count(b.incoming)}</NavLink>
        <NavLink to="/people"><Users size={20} />People here{b.people > 0 && <span className="count quiet">{b.people}</span>}</NavLink>
      </nav>

      <DemoTools refresh={refresh} />
    </aside>
  )
}

// A small, discreet tool for showing the project.
function DemoTools({ refresh }) {
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()

  async function reset() {
    await post('/api/demo/reset')
    setConfirming(false)
    setNote('Demo data was reset.')
    navigate('/')
    refresh()
  }

  return (
    <div className="demo-tools">
      <div className="demo-buttons">
        {!confirming && <button type="button" onClick={() => setConfirming(true)}>Reset demo data</button>}
        {confirming && <button type="button" className="danger" onClick={reset}>Yes, reset</button>}
        {confirming && <button type="button" onClick={() => setConfirming(false)}>Cancel</button>}
      </div>
      {note && <p className="demo-note">{note}</p>}
    </div>
  )
}
