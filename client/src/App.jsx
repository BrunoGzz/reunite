import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { get, post } from './api.js'
import Sidebar from './components/Sidebar.jsx'
import Home from './pages/Home.jsx'
import Register from './pages/Register.jsx'
import Search from './pages/Search.jsx'
import OurSearches from './pages/OurSearches.jsx'
import Incoming from './pages/Incoming.jsx'
import People from './pages/People.jsx'

export default function App() {
  const [me, setMe] = useState(null)
  const [shelters, setShelters] = useState([])

  // No login: the first visit starts at the first shelter, and the sidebar can change that.
  useEffect(() => {
    async function start() {
      const list = await get('/api/shelters')
      setShelters(list)
      try {
        setMe(await get('/api/me'))
      } catch {
        const first = [...list].sort((a, b) => a.id - b.id)[0]
        setMe(await post('/api/session', { shelterId: first.id }))
      }
    }
    start()
  }, [])

  if (!me) return null

  return (
    <Routes>
      <Route element={<Layout me={me} shelters={shelters} onChoose={async (shelterId) => setMe(await post('/api/session', { shelterId }))} />}>
        <Route index element={<Home />} />
        <Route path="register" element={<Register />} />
        <Route path="search" element={<Search />} />
        <Route path="searches" element={<OurSearches />} />
        <Route path="searches/:id" element={<Search />} />
        <Route path="incoming" element={<Incoming />} />
        <Route path="review" element={<Navigate to="/incoming" replace />} />
        <Route path="attention" element={<Navigate to="/searches" replace />} />
        <Route path="requests" element={<Navigate to="/incoming" replace />} />
        <Route path="people" element={<People />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}

// Sidebar plus the page. Polls the sidebar counts every 15 seconds so everything stays fresh.
function Layout({ me, shelters, onChoose }) {
  const [badges, setBadges] = useState(null)
  const navigate = useNavigate()

  const refresh = () => get('/api/badges').then(setBadges).catch(() => {})

  useEffect(() => {
    setBadges(null)
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => clearInterval(timer)
  }, [me.shelterId])

  // Changing shelter starts fresh on Home, so no page keeps showing another shelter's data.
  async function choose(shelterId) {
    await onChoose(shelterId)
    navigate('/')
  }

  return (
    <div className="app">
      <Sidebar me={me} shelters={shelters} onChoose={choose} badges={badges} refresh={refresh} />
      <main className="page">
        <Outlet key={me.shelterId} context={{ badges, refresh, me }} />
      </main>
    </div>
  )
}
