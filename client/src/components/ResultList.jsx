import { useEffect, useRef, useState } from 'react'
import { post } from '../api.js'

// Search results. Never shows names or shelters, except after the other person accepted.
export default function ResultList({ results, onChanged }) {
  const [asking, setAsking] = useState(null)

  if (results.length === 0) {
    return <div className="empty">No possible matches yet. This search stays open, and you will get an alert if someone new matches.</div>
  }

  return (
    <>
      {results.map((r) => (
        <div className="card result" key={r.match_id}>
          <div className="score">{r.score}%</div>
          <div className="grow">
            <div className="summary">{r.summary} {r.reciprocal && <span className="tag accent">Reciprocal</span>}</div>
            <ul className="reasons">{r.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            {r.request === 'accepted' && <Reunion reunion={r.reunion} />}
          </div>
          <div className="action">
            {r.request === null && <button className="btn" onClick={() => setAsking(r)}>Send contact request</button>}
            {r.request === 'pending' && <span className="status">Pending confirmation</span>}
          </div>
        </div>
      ))}
      {asking && <ContactModal result={asking} onClose={() => setAsking(null)} onSent={() => { setAsking(null); onChanged() }} />}
    </>
  )
}

export function Reunion({ reunion, receiver = false }) {
  const s = reunion.shelter
  return (
    <div className="reunion">
      <strong>{receiver ? `${reunion.person_name || 'The family'} is waiting at:` : `${reunion.person_name || 'The person'} accepted contact.`}</strong>
      <div>{s.name}</div>
      <div>{s.address}, phone {s.phone}</div>
      <div className="muted">{s.instructions}</div>
    </div>
  )
}

function ContactModal({ result, onClose, onSent }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setCameraError('The camera is not available. You can upload a photo instead.'))
    return () => streamRef.current && streamRef.current.getTracks().forEach((t) => t.stop())
  }, [])

  function takePhoto() {
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => keepPhoto(blob), 'image/jpeg', 0.85)
  }

  function keepPhoto(file) {
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  async function send() {
    const form = new FormData()
    form.append('message', message)
    form.append('familyDetail', detail)
    if (photo) form.append('photo', photo, 'photo.jpg')
    setSending(true)
    try {
      await post(`/api/matches/${result.match_id}/request`, form)
      onSent()
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h2>Send contact request</h2>
        <p className="muted">The other person will see this and decide. They are never told who you are until they say yes.</p>

        {result.photo_required ? <p>Take a photo of the person who is looking.</p> : <p className="muted">No photo is needed for this reciprocal match. You may add one.</p>}
        {preview ? (
          <div>
            <img className="photo" src={preview} alt="Photo to send" />
            <button className="btn secondary" onClick={() => { setPhoto(null); setPreview('') }}>Retake</button>
          </div>
        ) : (
          <div>
            {!cameraError && <video ref={videoRef} autoPlay playsInline muted className="photo" />}
            {cameraError && <p className="muted">{cameraError}</p>}
            <div className="row">
              {!cameraError && <button className="btn secondary" onClick={takePhoto}>Take photo</button>}
              <label className="btn secondary">Upload a file
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && keepPhoto(e.target.files[0])} />
              </label>
            </div>
          </div>
        )}

        <label className="field">Short message from the person looking
          <textarea rows="2" value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="field">Something only the family would know (optional)
          <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="For example: our dog is called Toby" />
        </label>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn big" onClick={send} disabled={sending}>Send request</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
