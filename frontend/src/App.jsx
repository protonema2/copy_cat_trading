import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import BotListPage from './pages/BotListPage'
import ChannelListPage from './pages/ChannelListPage'
import BotDetailPage from './pages/BotDetailPage'
import TelegramSessionPage from './pages/TelegramSessionPage'
import SignalsPage from './pages/SignalsPage'
import InstrumentSymbolsPage from './pages/InstrumentSymbolsPage'
import ChannelPerformancePage from './pages/ChannelPerformancePage'
import LoginPage from './pages/LoginPage'
import { authApi, botApi, clearAuthToken, getAuthToken } from './api'

export default function App() {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken()
      if (!token) {
        setAuthLoading(false)
        setLoading(false)
        return
      }

      try {
        const response = await authApi.me()
        setUser(response.data)
      } catch (error) {
        clearAuthToken()
        setUser(null)
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (!user) {
      setBots([])
      return
    }

    refreshBots()
  }, [user])

  const refreshBots = async () => {
    setLoading(true)
    try {
      const response = await botApi.list()
      setBots(response.data)
    } catch (error) {
      console.error('Failed to refresh bots:', error)
      if (error.response?.status === 401) {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser)
  }

  const handleLogout = () => {
    clearAuthToken()
    setUser(null)
    setBots([])
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-gray-300">
        Loading...
      </div>
    )
  }

  return (
    <Router>
      {user ? (
        <div className="flex min-h-screen flex-col bg-gray-950 lg:h-screen lg:flex-row">
          <Sidebar
            user={user}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
            onLogout={handleLogout}
          />
          <main className="min-w-0 flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/bots" />} />
              <Route path="/login" element={<Navigate to="/bots" />} />
              <Route path="/bots" element={<BotListPage bots={bots} onRefresh={refreshBots} loading={loading} />} />
              <Route path="/bots/:botId" element={<BotDetailPage onRefresh={refreshBots} />} />
              <Route path="/channels" element={<ChannelListPage onRefresh={refreshBots} />} />
              <Route path="/telegram-session" element={<TelegramSessionPage />} />
              <Route path="/signals" element={<SignalsPage />} />
              <Route path="/instrument-symbols" element={<InstrumentSymbolsPage />} />
              <Route path="/performance" element={<ChannelPerformancePage />} />
              <Route path="/performance/:channelId" element={<ChannelPerformancePage />} />
              <Route path="*" element={<Navigate to="/bots" />} />
            </Routes>
          </main>
        </div>
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      )}
    </Router>
  )
}
