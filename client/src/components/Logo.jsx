// Two circles that meet in the middle: people finding each other.
export default function Logo() {
  return (
    <div className="logo">
      <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true">
        <circle cx="14" cy="14" r="11" fill="none" stroke="var(--accent)" strokeWidth="3.2" />
        <circle cx="26" cy="14" r="11" fill="none" stroke="var(--accent)" strokeWidth="3.2" opacity="0.55" />
      </svg>
      <span className="logo-word">Reunite</span>
    </div>
  )
}
