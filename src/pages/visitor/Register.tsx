import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [company, setCompany] = useState('')
  const [designation, setDesignation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mobile.length < 6 || !/^\d+$/.test(mobile)) {
      setError('Mobile number must be at least 6 digits and contain only numbers')
      setLoading(false)
      return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password: mobile,
    })

    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    const userId = data.user?.id
    if (!userId) { setError('Registration failed'); setLoading(false); return }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId, name, email, mobile, role: 'visitor',
      company_name: company, designation,
    })

    if (profileError) { setError(profileError.message); setLoading(false); return }

    navigate('/')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="bg-primary text-white text-center py-4 px-6 rounded-t-2xl">
          <h1 className="text-xl font-bold">InfoComm India 2026</h1>
          <p className="text-sm opacity-80">Visitor Registration</p>
        </div>
        <form onSubmit={handleSubmit} className="border border-gray-200 rounded-b-2xl p-6 space-y-4">
          <div className="bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded">
            <p className="text-xs text-amber-800">Please use the same email address you used to register for your InfoComm India show badge.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
              minLength={6}
              pattern="[0-9]+"
              value={mobile}
              onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              required
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
            <input
              required
              value={designation}
              onChange={e => setDesignation(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white rounded-lg py-3 font-semibold disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Get Started'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Already registered?{' '}
            <Link to="/login" className="text-primary font-medium">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
