import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Inbox, Users, ShieldCheck, Building2, Bell, ChevronRight, Check, UserSearch, MessageCircleHeart, ClipboardCheck } from 'lucide-react'
import { post } from '../api.js'
import Logo from './Logo.jsx'

export default function Sidebar({ me, shelters, onChoose, dashboard, refresh }) {
  const navigate = useNavigate()
  const alerts = dashboard ? dashboard.alerts : []
  const waiting = dashboard ? dashboard.pendingRequests : 0
  const total = alerts.length + (waiting > 0 ? 1 : 0)

  async function open(alert) {
    await post(`/api/notifications/${alert.id}/read`)
    refresh()
    if (alert.kind === 'review_needed') navigate('/coordinator')
    else if (alert.kind === 'match_alert') navigate(`/searches/${alert.search_id}`)
  }

  return (
    <aside className="sidebar">
      <Logo />

      <div className="switcher">
        <label className="switcher-label" htmlFor="shelter-select">Working at</label>
        <div className="select-wrap">
          <Building2 size={18} />
          <select id="shelter-select" value={me.shelterId} onChange={(e) => onChoose(Number(e.target.value), me.role)}>
            {shelters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="segmented" role="group" aria-label="Role">
          <button type="button" className={me.role === 'volunteer' ? 'on' : ''} onClick={() => onChoose(me.shelterId, 'volunteer')}>Volunteer</button>
          <button type="button" className={me.role === 'coordinator' ? 'on' : ''} onClick={() => onChoose(me.shelterId, 'coordinator')}>Coordinator</button>
        </div>
      </div>

      <nav className="nav">
        <NavLink to="/" end><Home size={20} />Home</NavLink>
        <NavLink to="/requests"><Inbox size={20} />Requests{waiting > 0 && <span className="count">{waiting}</span>}</NavLink>
        <NavLink to="/people"><Users size={20} />People here</NavLink>
        {me.role === 'coordinator' && <NavLink to="/coordinator"><ShieldCheck size={20} />Coordinator</NavLink>}
      </nav>

      <section className="attention" aria-label="Needs your attention">
        <h2><Bell size={16} />Needs your attention {total > 0 && <span className="count">{total}</span>}</h2>

        {dashboard && total === 0 && <p className="attention-empty">You are all caught up.</p>}

        {waiting > 0 && (
          <button type="button" className="attn-item" onClick={() => navigate('/requests')}>
            <span className="attn-icon"><MessageCircleHeart size={18} /></span>
            <span className="attn-text">{waiting === 1 ? '1 person wants' : `${waiting} people want`} to contact someone here</span>
            <ChevronRight size={16} />
          </button>
        )}

        {alerts.map((a) => (
          <button type="button" className="attn-item" key={a.id} onClick={() => open(a)}>
            <span className="attn-icon">{a.kind === 'review_needed' ? <ClipboardCheck size={18} /> : a.kind === 'reunion' ? <Check size={18} /> : <UserSearch size={18} />}</span>
            <span className="attn-text">{a.text}</span>
            {a.kind === 'reunion' ? <span className="attn-got">Got it</span> : <ChevronRight size={16} />}
          </button>
        ))}
      </section>
    </aside>
  )
}
