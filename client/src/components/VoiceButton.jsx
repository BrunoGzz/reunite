import { useEffect, useRef, useState } from 'react'
import { Mic, Loader2 } from 'lucide-react'
import { get, post } from '../api.js'

const MIN_MS = 700
const MAX_MS = 60000
const BARS = 21 // bars on each side of the middle, so the waveform is symmetrical
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
  const canvasRef = useRef(null)
  const holding = useRef(false) // true from press until release, even while the permission prompt is open
  const recorder = useRef(null)
  const stream = useRef(null)
  const chunks = useRef([])
  const startedAt = useRef(0)
  const timers = useRef({})
  const meter = useRef(null)

  useEffect(() => {
    get('/api/voice/status').then((s) => setConfigured(s.configured)).catch(() => {})
    drawBars(canvasRef.current, new Array(BARS).fill(0)) // a calm, flat line before anyone speaks
  }, [])

  // Live level: an AnalyserNode listens to the same microphone stream that is being recorded.
  function startMeter(media) {
    const audio = new AudioContext()
    audio.resume()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.75
    audio.createMediaStreamSource(media).connect(analyser)
    const bins = new Uint8Array(analyser.frequencyBinCount)
    let smooth = 0

    const frame = () => {
      analyser.getByteFrequencyData(bins)
      const bars = []
      for (let i = 0; i < BARS; i++) bars.push(bins[i + 1] / 255) // voice sits in the lowest bins
      const level = bars.reduce((a, b) => a + b, 0) / BARS
      smooth += (level - smooth) * 0.25
      micRef.current && micRef.current.style.setProperty('--level', smooth.toFixed(3))
      drawBars(canvasRef.current, bars)
      meter.current.raf = requestAnimationFrame(frame)
    }
    meter.current = { audio, raf: requestAnimationFrame(frame) }
  }

  function stopMeter() {
    if (!meter.current) return
    cancelAnimationFrame(meter.current.raf)
    meter.current.audio.close()
    meter.current = null
    micRef.current && micRef.current.style.setProperty('--level', 0)
    drawBars(canvasRef.current, new Array(BARS).fill(0))
  }

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
    startMeter(media)
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
    stopMeter()
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
    stopMeter()
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop())
  }, [])

  const label = {
    idle: 'Hold to speak',
    recording: `Listening... ${seconds}s`,
    working: 'Understanding what was said...',
  }[state]

  return (
    <div className="voice">
      <div className={'mic-stage' + (state === 'recording' ? ' recording' : '')}>
        <span className="ring ring-one" />
        <span className="ring ring-two" />
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
          {state === 'working' ? <Loader2 className="spin" size={84} strokeWidth={1.5} /> : <Mic size={84} strokeWidth={1.5} />}
        </button>
      </div>
      <canvas ref={canvasRef} className="waveform" width="420" height="64" aria-hidden="true" />
      <p className="voice-label">{label}</p>
      {state === 'recording' && <p className="muted small">Let go when you are done.</p>}
      {configured && state === 'idle' && !message && <p className="muted small">You can also hold the Space bar when no field is selected.</p>}
      {!configured && <p className="muted">Voice input is not configured. You can fill in the form below.</p>}
      {message && <p className="error">{message}</p>}
    </div>
  )
}

// Rounded bars, tallest in the middle, drawn from the live frequency levels.
function drawBars(canvas, levels) {
  if (!canvas) return
  const ratio = window.devicePixelRatio || 1
  if (canvas.width !== 420 * ratio) {
    canvas.width = 420 * ratio
    canvas.height = 64 * ratio
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, 420, 64)
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E31C5F'
  const total = levels.length * 2
  const slot = 420 / total
  const width = Math.max(3, slot * 0.55)
  for (let i = 0; i < total; i++) {
    const level = levels[i < levels.length ? levels.length - 1 - i : i - levels.length]
    const height = Math.max(5, Math.min(60, 5 + level * 70))
    const x = i * slot + (slot - width) / 2
    ctx.fillStyle = accent
    ctx.globalAlpha = level > 0.02 ? 0.45 + Math.min(0.55, level) : 0.25
    ctx.beginPath()
    ctx.roundRect(x, (64 - height) / 2, width, height, width / 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}
