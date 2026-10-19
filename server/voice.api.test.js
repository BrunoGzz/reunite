// Runs POST /api/voice against a local stand-in for OpenAI transcription and DeepSeek chat completions.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

const TRANSCRIPT = 'Se llama Itziar Etxeberria, tiene unos cincuenta anos y una cicatriz en la mano.'

const seen = { transcribe: [], deepseek: [] }
let whisperReply
let deepseekReply
const toolCall = (input, name = 'fill_form') => ({
  choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: typeof input === 'string' ? input : JSON.stringify(input) } }] } }],
})
const f = (value, confidence = 'high') => ({ value, confidence })
const NULLS = Object.fromEntries(['name', 'sex', 'age', 'height', 'hair_color', 'marks', 'languages', 'last_place', 'last_seen_day', 'last_seen_part', 'arrival_method', 'needs_assistance'].map((k) => [k, f(null)]))
const goodInput = () => ({ ...NULLS, name: f('Itziar Etxeberria', 'low'), sex: f('female'), age: f(52), marks: f('scar on hand'), language: 'Spanish' })
const reset = () => {
  seen.transcribe = []
  seen.deepseek = []
  whisperReply = () => ({ status: 200, body: { text: TRANSCRIPT, language: 'spanish' } })
  deepseekReply = () => ({ status: 200, body: toolCall(goodInput()) })
}

const mock = http.createServer((req, res) => {
  const parts = []
  req.on('data', (c) => parts.push(c))
  req.on('end', () => {
    const body = Buffer.concat(parts)
    let reply
    if (req.url === '/v1/audio/transcriptions') {
      const text = body.toString('latin1')
      seen.transcribe.push({ auth: req.headers.authorization, model: /name="model"\r\n\r\n([^\r]+)/.exec(text)[1], verbose: text.includes('verbose_json'), filename: /filename="([^"]+)"/.exec(text)[1], bytes: body.length })
      reply = whisperReply()
    } else if (req.url === '/chat/completions') {
      seen.deepseek.push({ headers: req.headers, raw: body.toString(), body: JSON.parse(body.toString()) })
      reply = deepseekReply()
    } else {
      reply = { status: 404, body: {} }
    }
    res.writeHead(reply.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(reply.body))
  })
})
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve))
const mockUrl = `http://127.0.0.1:${mock.address().port}`

process.env.REUNITE_DB = ':memory:'
process.env.OPENAI_API_KEY = 'test-openai'
process.env.DEEPSEEK_API_KEY = 'test-deepseek'
process.env.DEEPSEEK_MODEL = 'deepseek-flash'
process.env.OPENAI_BASE_URL = `${mockUrl}/v1`
process.env.DEEPSEEK_BASE_URL = mockUrl
const { createApp } = await import('./app.js')
const { seed } = await import('./seed.js')
seed()
const server = createApp().listen(0)
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => { server.close(); mock.close() })

const login = async () => {
  const res = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shelterId: 1 }) })
  return res.headers.getSetCookie()[0].split(';')[0]
}

async function speak({ mode = 'person', bytes = 5000, cookie } = {}) {
  const form = new FormData()
  form.append('audio', new Blob([Buffer.alloc(bytes, 1)], { type: 'audio/webm;codecs=opus' }), 'speech')
  form.append('mode', mode)
  const res = await fetch(`${base}/api/voice`, { method: 'POST', headers: { cookie: cookie || (await login()) }, body: form })
  return { status: res.status, body: await res.json() }
}

test('status needs both the OpenAI and the DeepSeek key', async () => {
  const cookie = await login()
  const status = async () => (await (await fetch(`${base}/api/voice/status`, { headers: { cookie } })).json()).configured
  assert.equal(await status(), true)
  process.env.DEEPSEEK_API_KEY = ''
  assert.equal(await status(), false)
  process.env.DEEPSEEK_API_KEY = 'test-deepseek'
  process.env.OPENAI_API_KEY = ''
  assert.equal(await status(), false)
  process.env.OPENAI_API_KEY = 'test-openai'
})

test('without a key the endpoint says it is not configured and calls nobody', async () => {
  reset()
  process.env.DEEPSEEK_API_KEY = ''
  const res = await speak()
  process.env.DEEPSEEK_API_KEY = 'test-deepseek'
  assert.equal(res.status, 503)
  assert.equal(seen.transcribe.length + seen.deepseek.length, 0)
})

test('happy path: transcript, language and validated fields come back', async () => {
  reset()
  const res = await speak()
  assert.equal(res.status, 200)
  assert.equal(res.body.transcript, TRANSCRIPT)
  assert.equal(res.body.language, 'Spanish')
  assert.deepEqual(res.body.fields.name, { value: 'Itziar Etxeberria', confidence: 'low' })
  assert.deepEqual(res.body.fields.age, { value: 52, confidence: 'high' })
  assert.equal(res.body.fields.height, undefined) // null stays out
})

test('transcription request: OpenAI key, configured model, verbose_json, audio file', async () => {
  reset()
  await speak()
  const t = seen.transcribe[0]
  assert.equal(t.auth, 'Bearer test-openai')
  assert.equal(t.model, process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1')
  assert.equal(t.verbose, true)
  assert.equal(t.filename, 'speech.webm')
  assert.ok(t.bytes > 5000)
})

test('extraction request: DeepSeek key and model, forced function call, thinking off, text only', async () => {
  reset()
  await speak()
  const d = seen.deepseek[0]
  assert.equal(d.headers.authorization, 'Bearer test-deepseek')
  assert.equal(d.headers['x-api-key'], undefined)
  assert.equal(d.body.model, 'deepseek-flash')
  assert.deepEqual(d.body.tool_choice, { type: 'function', function: { name: 'fill_form' } })
  assert.equal(d.body.tools[0].type, 'function')
  assert.equal(d.body.tools[0].function.name, 'fill_form')
  assert.ok(d.body.tools[0].function.parameters.properties.needs_assistance)
  assert.deepEqual(d.body.thinking, { type: 'disabled' }) // a forced tool choice is an error in thinking mode
  assert.equal(d.body.response_format, undefined)
  const [system, user] = d.body.messages
  assert.equal(system.role, 'system')
  assert.match(system.content, /Never invent/)
  assert.match(system.content, /immigration/)
  assert.ok(user.content.includes(TRANSCRIPT))
  assert.ok(d.raw.length < 20000, 'only text is sent, never audio')
})

test('target mode does not offer needs_assistance and says the person is being searched for', async () => {
  reset()
  await speak({ mode: 'target' })
  const d = seen.deepseek[0]
  assert.equal(d.body.tools[0].function.parameters.properties.needs_assistance, undefined)
  assert.match(d.body.messages[0].content, /searched for/)
})

test('values outside the form are dropped even if the model returns them', async () => {
  reset()
  deepseekReply = () => ({ status: 200, body: toolCall({ ...goodInput(), height: f('giant'), sex: f('unknown'), age: f(400), last_seen_day: f('yesterday'), needs_assistance: f(true) }) })
  const { body } = await speak({ mode: 'target' })
  // Only the valid name and marks survive. In target mode needs_assistance is not accepted either.
  assert.deepEqual(Object.keys(body.fields).sort(), ['marks', 'name'])
})

test('failures give a friendly 502 and never log the spoken text', async () => {
  const cases = {
    'DeepSeek returns an error': () => { deepseekReply = () => ({ status: 500, body: { error: 'boom' } }) },
    'DeepSeek rejects the request': () => { deepseekReply = () => ({ status: 400, body: { error: 'bad' } }) },
    'no function call in the reply': () => { deepseekReply = () => ({ status: 200, body: { choices: [{ message: { role: 'assistant', content: `I heard: ${TRANSCRIPT}` } }] } }) },
    'a different function was called': () => { deepseekReply = () => ({ status: 200, body: toolCall(goodInput(), 'something_else') }) },
    'arguments are not valid JSON': () => { deepseekReply = () => ({ status: 200, body: toolCall('Etxeberria is the name') }) },
    'transcription fails': () => { whisperReply = () => ({ status: 500, body: {} }) },
  }
  const original = console.error
  for (const [label, setup] of Object.entries(cases)) {
    reset()
    setup()
    const logged = []
    console.error = (...args) => logged.push(args.join(' '))
    let res
    try { res = await speak() } finally { console.error = original }
    assert.equal(res.status, 502, label)
    assert.match(res.body.error, /could not understand/, label)
    assert.ok(!logged.join(' ').includes('Etxeberria'), `${label}: the log must not contain the transcript`)
  }
})

test('a recording that is too small is rejected before anything is sent', async () => {
  reset()
  const res = await speak({ bytes: 100 })
  assert.equal(res.status, 400)
  assert.equal(seen.transcribe.length, 0)
})

test('an empty transcript is rejected before extraction', async () => {
  reset()
  whisperReply = () => ({ status: 200, body: { text: '  ', language: 'english' } })
  const res = await speak()
  assert.equal(res.status, 422)
  assert.equal(seen.deepseek.length, 0)
})
