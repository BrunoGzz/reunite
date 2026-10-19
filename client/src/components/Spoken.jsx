// What the speaker said, shown only while the volunteer reviews. It is never saved.
export default function Spoken({ spoken }) {
  if (!spoken) return null
  return (
    <div className="notice spoken">
      <strong>Heard{spoken.language ? ` in ${spoken.language}` : ''}:</strong> "{spoken.transcript}"
      <div className="muted small">Check the form below before saving. This text is not saved.</div>
    </div>
  )
}
