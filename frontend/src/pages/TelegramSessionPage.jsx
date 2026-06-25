import React, { useEffect, useState } from 'react'
import { AlertTriangle, LogIn, LogOut, RefreshCw, ShieldCheck, Wifi } from 'lucide-react'
import { telegramSessionApi } from '../api'

export default function TelegramSessionPage() {
  const [status, setStatus] = useState({ is_active: false, needs_password: false })
  const [readerStatus, setReaderStatus] = useState(null)
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

    const interval = setInterval(fetchReaderStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    try {
      const [sessionResponse, readerResponse] = await Promise.all([
        telegramSessionApi.status(),
        telegramSessionApi.readerStatus(),
      ])
      setStatus(sessionResponse.data)
      setReaderStatus(readerResponse.data)
    } catch (error) {
      console.error('Failed to fetch Telegram session status:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchReaderStatus = async () => {
    try {
      const response = await telegramSessionApi.readerStatus()
      setReaderStatus(response.data)
    } catch (error) {
      console.error('Failed to fetch Telegram reader status:', error)
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
      fetchReaderStatus()
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
      fetchReaderStatus()
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
      fetchReaderStatus()
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
      fetchReaderStatus()
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

  if (loading) return <div className="p-4 text-center text-gray-300 sm:p-8">Loading...</div>

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Telegram Session</h1>
        <p className="text-sm text-gray-400 mt-2">Authorize the Telegram account that reads source channels.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
        <TelegramReaderStatusPanel status={readerStatus} onRefresh={fetchReaderStatus} />

        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 sm:p-6">
        {status.is_active ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 shrink-0 text-green-400" size={22} />
              <div className="min-w-0">
                <p className="text-white font-semibold">Telegram user session is active</p>
                <p className="mt-1 break-words text-sm text-gray-400">
                  {status.first_name || 'Telegram user'}
                  {status.username ? ` (@${status.username})` : ''}
                </p>
                <p className="mt-1 break-all text-xs text-gray-500">{status.phone_number}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50 sm:w-auto"
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
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSubmitPassword}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
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
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
            />
            <button
              onClick={handleVerifyCode}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
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
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Telegram API Hash"
              value={formData.api_hash}
              onChange={(e) => updateForm('api_hash', e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Phone Number (+628...)"
              value={formData.phone_number}
              onChange={(e) => updateForm('phone_number', e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
            />
            <button
              onClick={handleStartLogin}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
            >
              <LogIn size={18} />
              Send Login Code
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

function TelegramReaderStatusPanel({ status, onRefresh }) {
  const state = status?.state || 'unknown'
  const healthy = status?.is_running && status?.is_authorized
  const needsAttention = ['error', 'invalid_session', 'disconnected', 'waiting_for_session'].includes(state)

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              healthy ? 'bg-green-600/20 text-green-300' : needsAttention ? 'bg-red-600/20 text-red-300' : 'bg-blue-600/20 text-blue-300'
            }`}
          >
            {needsAttention ? <AlertTriangle size={20} /> : <Wifi size={20} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">Telegram Reader Health</h2>
            <p className="mt-1 text-sm text-gray-400">Live listener, polling fallback, and reconnect status.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center justify-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-600"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatusItem label="State" value={formatState(state)} strong />
        <StatusItem label="Authorized" value={status?.is_authorized ? 'Yes' : 'No'} />
        <StatusItem label="Running" value={status?.is_running ? 'Yes' : 'No'} />
        <StatusItem label="Reconnect Attempts" value={status?.reconnect_attempts ?? 0} />
        <StatusItem label="Last Connected" value={formatDateTime(status?.last_connected_at)} />
        <StatusItem label="Last Disconnected" value={formatDateTime(status?.last_disconnected_at)} />
      </div>

      {status?.last_error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {status.last_error}
        </div>
      )}
    </div>
  )
}

function StatusItem({ label, value, strong = false }) {
  return (
    <div className="rounded-lg bg-gray-900 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 break-words text-sm ${strong ? 'font-semibold text-white' : 'text-gray-300'}`}>{value || '-'}</p>
    </div>
  )
}

function formatState(state) {
  return String(state || 'unknown').replaceAll('_', ' ')
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function getErrorMessage(error) {
  return error.response?.data?.detail || error.message
}
