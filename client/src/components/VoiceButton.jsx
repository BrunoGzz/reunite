import { useEffect, useRef, useState } from 'react'
import { get, post } from '../api.js'

const MIN_MS = 700
const MAX_MS = 60000
const HOLD_HINT = 'Hold the button while you speak, then let go.'

// Prefer webm/opus (Chrome, Firefox) and fall back to mp4 (Safari).
function pickMimeType() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

// Space can start recording only when nothing else would use the key:
// not in a field, and not on a button, link or checkbox.
function spaceIsFree(micElement) {
  const el = document.activeElement
  return !el || el === document.body || el === micElement
}

// Push to talk. Calls onResult({ transcript, language, fields }) when the server understood the audio.
export default function VoiceButton({ mode, onResult }) {
  const [configured, setConfigured] = useState(true)
  const [state, setState] = useState('idle') // idle, recording, working
  const [seconds, setSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const micRef = useRef(null)
  const holding = useRef(false) // true from press until release, even while the permission prompt is open
  const recorder = useRef(null)
  const stream = useRef(null)
  const chunks = useRef([])
  const startedAt = useRef(0)
  const timers = useRef({})

  useEffect(() => {
    get('/api/voice/status').then((s) => setConfigured(s.configured)).catch(() => {})
  }, [])

  async function start() {
    if (holding.current || state !== 'idle') return
    if (!configured) return setMessage('Voice input is not configured.')
    holding.current = true
    setMessage('')
    let media
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } })
    } catch {
      holding.current = false
      return setMessage('The microphone is blocked or missing. You can type in the form instead.')
    }
    if (!holding.current) { // let go before the microphone was ready
      media.getTracks().forEach((t) => t.stop())
      return setMessage(HOLD_HINT)
    }
    stream.current = media
    const mimeType = pickMimeType()
    recorder.current = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
    chunks.current = []
    recorder.current.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    recorder.current.onstop = send
    recorder.current.start()
    startedAt.current = Date.now()
    setSeconds(0)
    setState('recording')
    timers.current.tick = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
    timers.current.limit = setTimeout(stop, MAX_MS)
  }

  function stop() {
    holding.current = false
    clearInterval(timers.current.tick)
    clearTimeout(timers.current.limit)
    if (recorder.current && recorder.current.state === 'recording') recorder.current.stop()
  }

  async function send() {
    const type = recorder.current.mimeType
    stream.current.getTracks().forEach((t) => t.stop())
    if (Date.now() - startedAt.current < MIN_MS) {
      setState('idle')
      return setMessage(HOLD_HINT)
    }
    setState('working')
    const form = new FormData()
    form.append('audio', new Blob(chunks.current, { type }), 'speech')
    form.append('mode', mode)
    try {
      onResult(await post('/api/voice', form))
    } catch (err) {
      setMessage(err.message)
    }
    setState('idle')
  }

  // Holding the Space bar does the same as holding the button.
  useEffect(() => {
    const down = (e) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !spaceIsFree(micRef.current)) return
      e.preventDefault()
      start()
    }
    const up = (e) => {
      if (e.code !== 'Space' || !holding.current) return
      e.preventDefault() // also stops a focused button from being "clicked" by the key release
      stop()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  })

  useEffect(() => () => {
    clearInterval(timers.current.tick)
    clearTimeout(timers.current.limit)
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop())
  }, [])

  const label = {
    idle: 'Hold to speak',
    recording: `Listening... ${seconds}s. Let go when you are done.`,
    working: 'Understanding what was said...',
  }[state]

  return (
    <div className="voice">
      <button
        type="button"
        ref={micRef}
        className={'mic' + (state === 'recording' ? ' recording' : '') + (!configured ? ' off' : '')}
        disabled={state === 'working'}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start() }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => e.code === 'Space' && e.preventDefault()}
        aria-label="Hold to speak"
      >
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
        </svg>
      </button>
      <p className="voice-label">{label}</p>
      {configured && state === 'idle' && !message && <p className="muted small">You can also hold the Space bar when no field is selected.</p>}
      {!configured && <p className="muted">Voice input is not configured. You can fill in the form below.</p>}
      {message && <p className="error">{message}</p>}
    </div>
  )
}
