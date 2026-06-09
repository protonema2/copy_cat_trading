import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bot, Radio, UserCog } from 'lucide-react'

export default function Sidebar() {
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">CopyCat</h1>
        <p className="text-sm text-gray-400">Trading Bot Manager</p>
      </div>

      <nav className="space-y-4">
        <Link
          to="/bots"
          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            isActive('/bots')
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Bot size={20} />
          <span>Bots</span>
        </Link>

        <Link
          to="/channels"
          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            isActive('/channels')
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Radio size={20} />
          <span>Channels</span>
        </Link>

        <Link
          to="/telegram-session"
          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            isActive('/telegram-session')
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          <UserCog size={20} />
          <span>Telegram</span>
        </Link>
      </nav>
    </aside>
  )
}
