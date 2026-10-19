import { useState } from 'react'
import { post } from '../api.js'
import { Reunion } from './ResultList.jsx'

// A contact request waiting for a decision. Asks twice, because both answers are hard to undo.
// Who is looking for whom. Both are at this shelter when the sender and the person asked about share it.
export function requestTitle(request, here = false) {
  const person = request.person_name || 'a person'
  const personHere = here || request.person_here
  if (request.sender_here && personHere) return `${request.searcher_name || 'Someone'} (here) is looking for ${person} (also here)`
  return `Someone is looking for ${person}${personHere ? ' (here)' : ''}`
}

export default function RequestCard({ request, onDecided, here = false }) {
  const [confirming, setConfirming] = useState(null)
  const [done, setDone] = useState(null)
  const [error, setError] = useState('')

  async function decide(decision) {
    try {
      const res = await post(`/api/requests/${request.id}/decide`, { decision })
      setDone({ decision, reunion: res.reunion })
      onDecided()
    } catch (err) {
      setError(err.message)
    }
  }

  if (done && done.decision === 'decline') {
    return <div className="card"><p>Declined. The family will not be told.</p></div>
  }
  if (done) {
    return <div className="card"><Reunion reunion={done.reunion} receiver /></div>
  }

  return (
    <div className="card request">
      {request.has_photo ? <img className="photo" src={`/api/photos/${request.id}`} alt="Photo of the person looking" /> : <div className="photo none">No photo</div>}
      <div className="grow">
        <div className="summary">{requestTitle(request, here)}</div>
        {!request.sender_here && <p>From: {request.searcher_name || 'a family member'}</p>}
        {request.message && <p>"{request.message}"</p>}
        {(request.is_minor || request.needs_assistance) ? (
          <p className="staff-note">{request.is_minor ? <span className="tag">Minor</span> : null}{request.needs_assistance ? <span className="tag">Needs assistance</span> : null} Staff decides: this person can't decide alone</p>
        ) : null}
        {error && <p className="error">{error}</p>}
        {!confirming && (
          <div className="row">
            <button className="btn big" onClick={() => setConfirming('accept')}>Accept</button>
            <button className="btn secondary" onClick={() => setConfirming('decline')}>Decline</button>
          </div>
        )}
        {confirming === 'accept' && (
          <div className="confirm">
            <p>Both shelters will see each other's name and location. Continue?</p>
            <div className="row">
              <button className="btn big" onClick={() => decide('accept')}>Yes, accept</button>
              <button className="btn secondary" onClick={() => setConfirming(null)}>Go back</button>
            </div>
          </div>
        )}
        {confirming === 'decline' && (
          <div className="confirm">
            <p>The family will not be told. Continue?</p>
            <div className="row">
              <button className="btn big" onClick={() => decide('decline')}>Yes, decline</button>
              <button className="btn secondary" onClick={() => setConfirming(null)}>Go back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
