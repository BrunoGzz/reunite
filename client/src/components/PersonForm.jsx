import { useEffect, useState } from 'react'
import { get } from '../api.js'

export function emptyPerson() {
  return {
    name: '', name_is_alias: false, sex: 'unknown', age: '', height: 'unknown', hair_color: '',
    marks: '', languages: '', last_place: '', last_seen_day: '', last_seen_part: '',
    arrival_method: '', needs_assistance: false,
  }
}

const HAIR = ['black', 'brown', 'blond', 'red', 'gray', 'white', 'other']
const ARRIVALS = ['bus', 'boat', 'own car', 'ambulance', 'agency transfer', 'other']

// mode "person": everything. "target": a person being searched for. "minimal": the basics only.
const DETAIL_FIELDS = ['height', 'hair_color', 'languages', 'last_seen_day', 'last_seen_part', 'arrival_method']

export default function PersonForm({ values, onChange, doubtful = [], heard = [], mode = 'person' }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const voiceTouchedDetails = [...doubtful, ...heard].some((f) => DETAIL_FIELDS.includes(f))
  useEffect(() => { if (voiceTouchedDetails) setMoreOpen(true) }, [voiceTouchedDetails])

  const set = (field) => (e) => onChange(field, e.target.type === 'checkbox' ? e.target.checked : e.target.value)
  const flag = (field) => (doubtful.includes(field) ? ' doubtful' : heard.includes(field) ? ' heard' : '')
  const hint = (field) => doubtful.includes(field) && (
    <span className="hint">{field === 'languages' ? 'The language heard. Please check.' : field === 'name' ? 'Please check this name' : 'Please check'}</span>
  )
  const minor = values.age !== '' && Number(values.age) < 18

  return (
    <div className="form">
      <div className="row">
        <label className={'field grow' + flag('name')}>Name
          <input value={values.name} onChange={set('name')} placeholder="Leave empty if unknown" />
          {hint('name')}
        </label>
        <label className={'field' + flag('sex')}>Sex
          <select value={values.sex} onChange={set('sex')}>
            <option value="unknown">Unknown</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
          {hint('sex')}
        </label>
        <label className={'field narrow' + flag('age')}>Age
          <input type="number" min="0" max="119" value={values.age} onChange={set('age')} placeholder="unknown" />
          {hint('age')}
          {minor && mode === 'person' && <span className="tag">Minor</span>}
        </label>
      </div>

      {mode === 'person' && (
        <label className="check">
          <input type="checkbox" checked={values.name_is_alias} onChange={set('name_is_alias')} />
          This may not be their real name
        </label>
      )}

      <div className="row">
        <PlaceInput className={'field grow' + flag('last_place')} value={values.last_place} onChange={(v) => onChange('last_place', v)} hint={hint('last_place')} />
        {mode !== 'minimal' && (
          <label className={'field grow' + flag('marks')}>Distinctive marks
            <input value={values.marks} onChange={set('marks')} placeholder="Tattoos, scars, glasses, wheelchair..." />
            {hint('marks')}
          </label>
        )}
      </div>

      {mode === 'person' && (
        <label className={'check' + (heard.includes('needs_assistance') ? ' heard-check' : '')}>
          <input type="checkbox" checked={values.needs_assistance} onChange={set('needs_assistance')} />
          Needs help to make decisions (for example dementia)
        </label>
      )}

      {mode !== 'minimal' && (
        <details open={moreOpen} onToggle={(e) => setMoreOpen(e.target.open)}>
          <summary>More details</summary>
          <div className="row">
            <label className={'field' + flag('height')}>Height
              <select value={values.height} onChange={set('height')}>
                <option value="unknown">Unknown</option>
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="tall">Tall</option>
              </select>
              {hint('height')}
            </label>
            <label className={'field' + flag('hair_color')}>Hair colour
              <select value={values.hair_color} onChange={set('hair_color')}>
                <option value="">Unknown</option>
                {HAIR.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              {hint('hair_color')}
            </label>
            <label className={'field grow' + flag('languages')}>Languages spoken
              <input value={values.languages} onChange={set('languages')} />
              {hint('languages')}
            </label>
          </div>
          <div className="row">
            <label className={'field' + flag('last_seen_day')}>Day last seen
              <input type="date" value={values.last_seen_day} onChange={set('last_seen_day')} />
              {hint('last_seen_day')}
            </label>
            <label className={'field' + flag('last_seen_part')}>Time of day
              <select value={values.last_seen_part} onChange={set('last_seen_part')}>
                <option value="">Unknown</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </select>
              {hint('last_seen_part')}
            </label>
            <label className={'field' + flag('arrival_method')}>How they got here
              <select value={values.arrival_method} onChange={set('arrival_method')}>
                <option value="">Unknown</option>
                {ARRIVALS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {hint('arrival_method')}
            </label>
          </div>
        </details>
      )}
    </div>
  )
}

// Free text with suggestions from places that already exist, so there are not ten spellings of one school.
export function PlaceInput({ value, onChange, className = 'field', label = 'Last known place', hint = null }) {
  const [options, setOptions] = useState([])
  const id = 'places-' + label.replace(/\s/g, '')

  function change(e) {
    onChange(e.target.value)
    if (e.target.value.length >= 2) get('/api/places?q=' + encodeURIComponent(e.target.value)).then(setOptions).catch(() => {})
  }

  return (
    <label className={className}>{label}
      <input list={id} value={value} onChange={change} placeholder="Where were they before the evacuation?" />
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      {hint}
    </label>
  )
}
