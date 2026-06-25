import React, { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { authApi, setAuthToken } from '../api'

export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = await authApi.login(form)
      setAuthToken(response.data.access_token)
      onLogin({ username: form.username })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-gray-700 bg-gray-800 p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <LockKeyhole size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">CopyCat Login</h1>
            <p className="text-sm text-gray-400">Sign in to manage the dashboard</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-300">Username</span>
          <input
            type="text"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white outline-none focus:border-blue-500"
            autoComplete="username"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-300">Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white outline-none focus:border-blue-500"
            autoComplete="current-password"
            required
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
        >
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
