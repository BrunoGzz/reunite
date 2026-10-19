import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { get, post } from '../api.js'
import PersonForm, { emptyPerson } from '../components/PersonForm.jsx'
import VoiceButton from '../components/VoiceButton.jsx'
import Spoken from '../components/Spoken.jsx'
import { useVoiceForm } from '../components/useVoiceForm.js'
import ResultList from '../components/ResultList.jsx'

export default function Search() {
  const { id } = useParams()
  return id ? <SearchResults id={id} /> : <NewSearch />
}

// An existing search, opened from its card in Our searches. Looking at it clears its "new" highlight.
function SearchResults({ id }) {
  const { refresh } = useOutletContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = () => get(`/api/searches/${id}`).then((d) => {
    setData(d)
    post(`/api/searches/${id}/seen`).then(refresh).catch(() => {})
  }).catch((e) => setError(e.message))

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!data) return null
  return (
    <>
      <h1>Results for {data.search.name || 'unnamed person'}</h1>
      <ResultList results={data.results} onChanged={load} />
    </>
  )
}

function NewSearch() {
  const { refresh } = useOutletContext()
  const { values: target, doubtful, heard, spoken, change: changeTarget, fill, reset: resetTarget } = useVoiceForm(emptyPerson)
  const [searcher, setSearcher] = useState(emptyPerson())
  const [searcherId, setSearcherId] = useState('')
  const [people, setPeople] = useState([])
  const [email, setEmail] = useState('')
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { get('/api/people').then(setPeople).catch(() => {}) }, [])

  async function submit() {
    const hasSomething = target.name || target.age !== '' || target.marks || target.last_place || target.sex !== 'unknown'
    if (!hasSomething) return setError('Describe the person you are looking for with at least one detail.')
    setBusy(true)
    try {
      const body = { target, email, emailOptIn }
      if (searcherId) body.searcherPersonId = Number(searcherId)
      else body.searcher = searcher
      const created = await post('/api/searches', body)
      setOutcome(created)
      post(`/api/searches/${created.search.id}/seen`).then(refresh).catch(() => {}) // its results are on screen right now
      setError('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const reload = () => get(`/api/searches/${outcome.search.id}`).then(setOutcome)

  if (outcome) {
    return (
      <>
        <h1>Results for {outcome.search.name || 'unnamed person'}</h1>
        <p className="muted">This search stays open. You will get an alert if someone new matches.</p>
        <ResultList results={outcome.results} onChanged={reload} />
        <button className="btn secondary" onClick={() => { setOutcome(null); resetTarget(); setSearcherId(''); setSearcher(emptyPerson()) }}>Start another search</button>
      </>
    )
  }

  return (
    <>
      <h1>Search for someone</h1>
      <p className="subtitle">Describe the person you are looking for.</p>
      <VoiceButton mode="target" onResult={fill} />
      <Spoken spoken={spoken} />
      <h2>Who are you looking for?</h2>
      <div className="card"><PersonForm values={target} onChange={changeTarget} doubtful={doubtful} heard={heard} mode="target" /></div>

      <h2>Who is looking?</h2>
      <div className="card">
        <label className="field">Person looking
          <select value={searcherId} onChange={(e) => setSearcherId(e.target.value)}>
            <option value="">Someone new</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name || 'Unnamed'}{p.age ? `, ${p.age}` : ''}</option>)}
          </select>
        </label>
        {!searcherId && <PersonForm values={searcher} onChange={(f, v) => setSearcher((s) => ({ ...s, [f]: v }))} mode="minimal" />}
        <label className="field">Email (optional)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={emailOptIn} onChange={(e) => setEmailOptIn(e.target.checked)} />
          Also email me when there is news
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="btn big" onClick={submit} disabled={busy}>Search</button>
    </>
  )
}
