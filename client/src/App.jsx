import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { get, post } from './api.js'
import Sidebar from './components/Sidebar.jsx'
import Home from './pages/Home.jsx'
import Register from './pages/Register.jsx'
import Search from './pages/Search.jsx'
import Requests from './pages/Requests.jsx'
import People from './pages/People.jsx'
import Coordinator from './pages/Coordinator.jsx'

export default function App() {
  const [me, setMe] = useState(null)
  const [shelters, setShelters] = useState([])

  // No login: the first visit starts as a volunteer at the first shelter, and the sidebar can change that.
  useEffect(() => {
    async function start() {
      const list = await get('/api/shelters')
      setShelters(list)
      try {
        setMe(await get('/api/me'))
      } catch {
        const first = [...list].sort((a, b) => a.id - b.id)[0]
        setMe(await post('/api/session', { shelterId: first.id, role: 'volunteer' }))
      }
    }
    start()
  }, [])

  if (!me) return null

  return (
    <Routes>
      <Route element={<Layout me={me} shelters={shelters} onChoose={async (shelterId, role) => setMe(await post('/api/session', { shelterId, role }))} />}>
        <Route index element={<Home />} />
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

// Sidebar plus the page. Polls the alerts every 15 seconds so everything stays fresh.
function Layout({ me, shelters, onChoose }) {
  const [dashboard, setDashboard] = useState(null)
  const navigate = useNavigate()

  const refresh = () => get('/api/dashboard').then(setDashboard).catch(() => {})

  useEffect(() => {
    setDashboard(null)
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => clearInterval(timer)
  }, [me.shelterId, me.role])

  // Changing shelter or role starts fresh on Home, so no page shows another shelter's data.
  async function choose(shelterId, role) {
    await onChoose(shelterId, role)
    navigate('/')
  }

  return (
    <div className="app">
      <Sidebar me={me} shelters={shelters} onChoose={choose} dashboard={dashboard} refresh={refresh} />
      <main className="page">
        <Outlet key={`${me.shelterId}-${me.role}`} context={{ dashboard, refresh, me }} />
      </main>
    </div>
  )
}
