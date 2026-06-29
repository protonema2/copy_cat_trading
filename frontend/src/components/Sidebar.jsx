import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bot, LogOut, PanelLeftClose, PanelLeftOpen, Radio, UserCog, Activity, Layers, BarChart2 } from 'lucide-react'

export default function Sidebar({ user, collapsed, onToggleCollapse, onLogout }) {
  const location = useLocation()

  const isActive = (path) => location.pathname === path
  const navLinkClass = (path) =>
    `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors sm:gap-3 sm:px-4 ${
      isActive(path)
        ? 'bg-blue-600 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`

  return (
    <aside
      className={`border-b border-gray-700 bg-gray-800/95 p-4 transition-[width] duration-200 lg:flex lg:flex-col lg:border-b-0 lg:border-r lg:p-4 ${
        collapsed ? 'lg:w-20' : 'lg:w-64'
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-4 lg:mb-8 lg:block">
        <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
          <h1 className="truncate text-xl font-bold text-white lg:text-2xl">CopyCat</h1>
          <p className="truncate text-xs text-gray-400 sm:text-sm">Trading Bot Manager</p>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden rounded-lg p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white lg:flex"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white lg:hidden"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-1 lg:flex-col lg:space-y-2 lg:overflow-visible lg:px-0 lg:pb-0">
        <Link
          to="/bots"
          className={`${navLinkClass('/bots')} ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
          title="Bots"
        >
          <Bot size={19} />
          <span className={collapsed ? 'lg:hidden' : ''}>Bots</span>
        </Link>

        <Link
          to="/channels"
          className={`${navLinkClass('/channels')} ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
          title="Channels"
        >
          <Radio size={19} />
          <span className={collapsed ? 'lg:hidden' : ''}>Channels</span>
        </Link>

        <Link
          to="/telegram-session"
          className={`${navLinkClass('/telegram-session')} ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
          title="Telegram"
        >
          <UserCog size={19} />
          <span className={collapsed ? 'lg:hidden' : ''}>Telegram</span>
        </Link>

        <Link
          to="/signals"
          className={`${navLinkClass('/signals')} ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
          title="Signals"
        >
          <Activity size={19} />
          <span className={collapsed ? 'lg:hidden' : ''}>Signals</span>
        </Link>

        <Link
          to="/instrument-symbols"
          className={`${navLinkClass('/instrument-symbols')} ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
          title="Instrument Symbols"
        >
          <Layers size={19} />
          <span className={collapsed ? 'lg:hidden' : ''}>Instruments</span>
        </Link>

        <Link
          to="/performance"
          className={`${navLinkClass('/performance')} ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
          title="Channel Performance"
        >
          <BarChart2 size={19} />
          <span className={collapsed ? 'lg:hidden' : ''}>Performance</span>
        </Link>
      </nav>

      <div className="hidden border-t border-gray-700 pt-4 lg:block">
        <p className={`mb-3 truncate text-sm text-gray-400 ${collapsed ? 'lg:hidden' : ''}`}>
          {user?.username || 'Dashboard user'}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className={`flex w-full items-center gap-3 rounded-lg px-4 py-2 text-gray-300 transition-colors hover:bg-gray-700 ${
            collapsed ? 'lg:justify-center lg:px-3' : ''
          }`}
          title="Logout"
        >
          <LogOut size={20} />
          <span className={collapsed ? 'lg:hidden' : ''}>Logout</span>
        </button>
      </div>
    </aside>
  )
}
