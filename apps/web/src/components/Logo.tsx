import { Link } from 'react-router-dom'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="logo" aria-label="CyberVett home">
      <span className="logo-mark" aria-hidden="true">C</span>
      {!compact && <span>CyberVett</span>}
    </Link>
  )
}
