import { useState } from 'react'
import { Link } from 'react-router-dom'
import { post } from '../api.js'
import PersonForm, { emptyPerson } from '../components/PersonForm.jsx'
import VoiceButton from '../components/VoiceButton.jsx'
import Spoken from '../components/Spoken.jsx'
import { useVoiceForm } from '../components/useVoiceForm.js'

export default function Register() {
  const { values, doubtful, heard, spoken, change, fill, reset } = useVoiceForm(emptyPerson)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const hasSomething = values.name || values.age !== '' || values.marks || values.last_place || values.sex !== 'unknown'
    if (!hasSomething) return setError('Add at least one detail about the person.')
    setSaving(true)
    try {
      setSaved(await post('/api/people', values))
      setError('')
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (saved) {
    return (
      <div className="card done">
        <h1>Saved</h1>
        <p>{saved.name || 'This person'} is registered here{saved.is_minor ? ' and marked as a minor' : ''}. If someone is looking for them, you will see an alert in the sidebar.</p>
        <div className="row">
          <button className="btn big" onClick={() => { setSaved(null); reset() }}>Register another person</button>
          <Link className="btn secondary" to="/">Back to Home</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <h1>Register a person</h1>
      <p className="subtitle">Speak or type. You can check everything before saving.</p>
      <VoiceButton mode="person" onResult={fill} />
      <Spoken spoken={spoken} />
      <div className="card">
        <PersonForm values={values} onChange={change} doubtful={doubtful} heard={heard} mode="person" />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn big" onClick={save} disabled={saving}>Save</button>
    </>
  )
}
