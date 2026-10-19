import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Bell, Inbox, Users, Building2, ChevronDown } from 'lucide-react'
import { post } from '../api.js'
import Logo from './Logo.jsx'

export default function Sidebar({ me, shelters, onChoose, attention, refresh }) {
  const waiting = attention ? attention.pendingRequests : 0
  // One count for everything on the "Needs attention" page: new alerts plus the review queue.
  const toDo = attention ? attention.alerts.length + attention.reviewCount : 0

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
        <NavLink to="/attention"><Bell size={20} />Needs attention{toDo > 0 && <span className="count">{toDo}</span>}</NavLink>
        <NavLink to="/requests"><Inbox size={20} />Requests{waiting > 0 && <span className="count">{waiting}</span>}</NavLink>
        <NavLink to="/people"><Users size={20} />People here</NavLink>
      </nav>

      <DemoTools refresh={refresh} />
    </aside>
  )
}

// Small, discreet tools for showing the project.
function DemoTools({ refresh }) {
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()

  async function lateArrival() {
    const done = await post('/api/demo/late-arrival')
    setNote(`${done.name} was registered at ${done.shelter}.`)
    refresh()
  }

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
        <button type="button" onClick={lateArrival}>Register late arrival</button>
        {!confirming && <button type="button" onClick={() => setConfirming(true)}>Reset demo data</button>}
        {confirming && <button type="button" className="danger" onClick={reset}>Yes, reset</button>}
        {confirming && <button type="button" onClick={() => setConfirming(false)}>Cancel</button>}
      </div>
      {note && <p className="demo-note">{note}</p>}
    </div>
  )
}
