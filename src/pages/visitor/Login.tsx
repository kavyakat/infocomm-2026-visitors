import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: mobile,
    })
    if (signInError) { setError('Email or mobile number not recognised'); setLoading(false); return }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="bg-primary text-white text-center py-4 px-6 rounded-t-2xl">
          <h1 className="text-xl font-bold">InfoComm India 2026</h1>
          <p className="text-sm opacity-80">Visitor Sign In</p>
        </div>
        <form onSubmit={handleSubmit} className="border border-gray-200 rounded-b-2xl p-6 space-y-4">
          <div className="bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded">
            <p className="text-xs text-amber-800">Please use the same email address you used to register for your InfoComm India show badge.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
            <input
              type="tel"
              required
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white rounded-lg py-3 font-semibold disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-center text-sm text-gray-500">
            New visitor?{' '}
            <Link to="/register" className="text-primary font-medium">Register here</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
