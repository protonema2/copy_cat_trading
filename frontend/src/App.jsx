import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import BotListPage from './pages/BotListPage'
import ChannelListPage from './pages/ChannelListPage'
import BotDetailPage from './pages/BotDetailPage'
import TelegramSessionPage from './pages/TelegramSessionPage'
import { botApi } from './api'

export default function App() {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBots = async () => {
      try {
        const response = await botApi.list()
        setBots(response.data)
      } catch (error) {
        console.error('Failed to fetch bots:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchBots()
  }, [])

  const refreshBots = async () => {
    try {
      const response = await botApi.list()
      setBots(response.data)
    } catch (error) {
      console.error('Failed to refresh bots:', error)
    }
  }

  return (
    <Router>
      <div className="flex h-screen bg-gray-900">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/bots" />} />
            <Route path="/bots" element={<BotListPage bots={bots} onRefresh={refreshBots} loading={loading} />} />
            <Route path="/bots/:botId" element={<BotDetailPage onRefresh={refreshBots} />} />
            <Route path="/channels" element={<ChannelListPage onRefresh={refreshBots} />} />
            <Route path="/telegram-session" element={<TelegramSessionPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
