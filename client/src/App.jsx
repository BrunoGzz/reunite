import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { get, post } from './api.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Register from './pages/Register.jsx'
import Search from './pages/Search.jsx'
import Requests from './pages/Requests.jsx'
import People from './pages/People.jsx'
import Coordinator from './pages/Coordinator.jsx'

export default function App() {
  const [me, setMe] = useState(undefined) // undefined while loading, null when logged out

  useEffect(() => {
    get('/api/me').then(setMe).catch(() => setMe(null))
  }, [])

  if (me === undefined) return null
  if (!me) return <Login onLogin={setMe} />

  return (
    <Routes>
      <Route element={<Layout me={me} onLogout={() => setMe(null)} />}>
        <Route index element={<Dashboard />} />
        <Route path="register" element={<Register />} />
        <Route path="search" element={<Search />} />
        <Route path="searches/:id" element={<Search />} />
        <Route path="requests" element={<Requests />} />
        <Route path="people" element={<People />} />
        {me.role === 'coordinator' && <Route path="coordinator" element={<Coordinator />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}

// Top bar plus the page. Polls the dashboard every 15 seconds so everything stays fresh.
function Layout({ me, onLogout }) {
  const [dashboard, setDashboard] = useState(null)
  const navigate = useNavigate()

  function refresh() {
    get('/api/dashboard').then(setDashboard).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => clearInterval(timer)
  }, [])

  async function logout() {
    await post('/api/logout')
    onLogout()
    navigate('/')
  }

  const waiting = dashboard ? dashboard.pendingRequests : 0
  const alerts = dashboard ? dashboard.alerts.length : 0

  return (
    <>
      <header className="topbar">
        <div className="brand">Reunite</div>
        <nav>
          <NavLink to="/" end>Dashboard{alerts > 0 && <span className="count">{alerts}</span>}</NavLink>
          <NavLink to="/register">Register</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/requests">Requests{waiting > 0 && <span className="count">{waiting}</span>}</NavLink>
          <NavLink to="/people">People here</NavLink>
          {me.role === 'coordinator' && <NavLink to="/coordinator">Coordinator</NavLink>}
        </nav>
        <div className="who">
          <span className="who-name" title={me.shelterName}>{me.shelterName}</span>
          <span className="who-role">({me.role})</span>
          <button className="link" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="page">
        <Outlet context={{ dashboard, refresh }} />
      </main>
    </>
  )
}
