import { Link } from 'react-router-dom'
import { UserPlus, Search, ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <div className="home">
      <Link to="/register" className="home-card">
        <span className="home-icon"><UserPlus size={44} strokeWidth={1.75} /></span>
        <span className="home-title">Register a person</span>
        <span className="home-text">Add someone who just arrived at this shelter, so their family can find them.</span>
        <ArrowRight className="home-arrow" size={26} />
      </Link>
      <Link to="/search" className="home-card">
        <span className="home-icon"><Search size={44} strokeWidth={1.75} /></span>
        <span className="home-title">Search for someone</span>
        <span className="home-text">Look for a family member who may be in another shelter.</span>
        <ArrowRight className="home-arrow" size={26} />
      </Link>
    </div>
  )
}
