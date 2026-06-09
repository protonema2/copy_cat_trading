import React, { useEffect, useState } from 'react'
import { LogIn, LogOut, ShieldCheck } from 'lucide-react'
import { telegramSessionApi } from '../api'

export default function TelegramSessionPage() {
  const [status, setStatus] = useState({ is_active: false, needs_password: false })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    api_id: '',
    api_hash: '',
    phone_number: '',
    code: '',
    password: '',
  })

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await telegramSessionApi.status()
      setStatus(response.data)
    } catch (error) {
      console.error('Failed to fetch Telegram session status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartLogin = async () => {
    setSubmitting(true)
    try {
      const response = await telegramSessionApi.start({
        api_id: formData.api_id,
        api_hash: formData.api_hash,
        phone_number: formData.phone_number,
      })
      setStatus(response.data)
    } catch (error) {
      alert('Failed to start Telegram login: ' + getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifyCode = async () => {
    setSubmitting(true)
    try {
      const response = await telegramSessionApi.verify(formData.code)
      setStatus(response.data)
    } catch (error) {
      alert('Failed to verify Telegram code: ' + getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitPassword = async () => {
    setSubmitting(true)
    try {
      const response = await telegramSessionApi.password(formData.password)
      setStatus(response.data)
    } catch (error) {
      alert('Failed to complete Telegram 2FA: ' + getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    if (!window.confirm('Deactivate the Telegram user session?')) return

    setSubmitting(true)
    try {
      await telegramSessionApi.logout()
      setStatus({ is_active: false, needs_password: false })
      setFormData({ api_id: '', api_hash: '', phone_number: '', code: '', password: '' })
    } catch (error) {
      alert('Failed to deactivate Telegram session: ' + getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const updateForm = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) return <div className="p-8 text-center text-gray-300">Loading...</div>

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Telegram Session</h1>
        <p className="text-sm text-gray-400 mt-2">Authorize the Telegram account that reads source channels.</p>
      </div>

      <div className="max-w-2xl bg-gray-800 rounded-lg border border-gray-700 p-6">
        {status.is_active ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-green-400 mt-1" size={22} />
              <div>
                <p className="text-white font-semibold">Telegram user session is active</p>
                <p className="text-sm text-gray-400 mt-1">
                  {status.first_name || 'Telegram user'}
                  {status.username ? ` (@${status.username})` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-1">{status.phone_number}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <LogOut size={18} />
              Deactivate Session
            </button>
          </div>
        ) : status.needs_password ? (
          <div className="space-y-4">
            <p className="text-white font-semibold">Enter Telegram 2FA password</p>
            <input
              type="password"
              placeholder="2FA Password"
              value={formData.password}
              onChange={(e) => updateForm('password', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleSubmitPassword}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <LogIn size={18} />
              Complete Login
            </button>
          </div>
        ) : status.id ? (
          <div className="space-y-4">
            <p className="text-white font-semibold">Enter the login code sent by Telegram</p>
            <p className="text-sm text-gray-400">{status.phone_number}</p>
            <input
              type="text"
              placeholder="Login Code"
              value={formData.code}
              onChange={(e) => updateForm('code', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleVerifyCode}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <LogIn size={18} />
              Verify Code
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Telegram API ID"
              value={formData.api_id}
              onChange={(e) => updateForm('api_id', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Telegram API Hash"
              value={formData.api_hash}
              onChange={(e) => updateForm('api_hash', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Phone Number (+628...)"
              value={formData.phone_number}
              onChange={(e) => updateForm('phone_number', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleStartLogin}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <LogIn size={18} />
              Send Login Code
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function getErrorMessage(error) {
  return error.response?.data?.detail || error.message
}
