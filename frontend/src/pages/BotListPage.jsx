import React, { useState } from 'react'
import { Eye, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { botApi } from '../api'
import Modal from '../components/Modal'

export default function BotListPage({ bots, onRefresh, loading }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBot, setEditingBot] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    api_id: '',
    api_hash: '',
    bot_token: '',
    session_name: 'session',
  })

  const resetForm = () => {
    setEditingBot(null)
    setFormData({ name: '', api_id: '', api_hash: '', bot_token: '', session_name: 'session' })
  }

  const openCreateModal = () => {
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (bot) => {
    setEditingBot(bot)
    setFormData({
      name: bot.name || '',
      api_id: bot.api_id || '',
      api_hash: bot.api_hash || '',
      bot_token: bot.bot_token || '',
      session_name: bot.session_name || 'session',
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    resetForm()
  }

  const handleSubmitBot = async () => {
    try {
      if (editingBot) {
        await botApi.update(editingBot.id, formData)
      } else {
        await botApi.create(formData)
      }
      closeModal()
      onRefresh()
    } catch (error) {
      alert(`Failed to ${editingBot ? 'update' : 'create'} bot: ` + error.message)
    }
  }

  const handleDeleteBot = async (botId) => {
    if (window.confirm('Are you sure you want to delete this bot?')) {
      try {
        await botApi.delete(botId)
        onRefresh()
      } catch (error) {
        alert('Failed to delete bot: ' + error.message)
      }
    }
  }

  const handleToggleBot = async (botId) => {
    try {
      await botApi.toggle(botId)
      onRefresh()
    } catch (error) {
      alert('Failed to toggle bot: ' + error.message)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Bots</h1>
          <p className="mt-1 text-sm text-gray-400">Manage Telegram bot credentials and runtime state.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 sm:w-auto"
        >
          <Plus size={20} />
          New Bot
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center text-gray-300">Loading...</div>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold text-white">{bot.name}</h3>
                <p className="mt-1 text-sm">
                  <span className={bot.is_active ? 'text-green-400' : 'text-red-400'}>
                    {bot.is_active ? 'Active' : 'Inactive'}
                  </span>
                </p>
                <p className="mt-1 truncate text-xs text-gray-500">API ID: {bot.api_id}</p>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:flex sm:items-center sm:gap-3">
                <a
                  href={`/bots/${bot.id}`}
                  className="flex items-center justify-center rounded-lg bg-gray-700 p-2 text-gray-300 transition-colors hover:text-white"
                  title="View details"
                >
                  <Eye size={20} />
                </a>
                <button
                  onClick={() => openEditModal(bot)}
                  className="flex items-center justify-center rounded-lg bg-gray-700 p-2 text-gray-300 transition-colors hover:text-white"
                  title="Edit bot"
                >
                  <Pencil size={20} />
                </button>
                <button
                  onClick={() => handleToggleBot(bot.id)}
                  className="flex items-center justify-center rounded-lg bg-gray-700 p-2 text-gray-300 transition-colors hover:text-white"
                  title={bot.is_active ? 'Deactivate' : 'Activate'}
                >
                  <Power size={20} />
                </button>
                <button
                  onClick={() => handleDeleteBot(bot.id)}
                  className="flex items-center justify-center rounded-lg bg-gray-700 p-2 text-red-400 transition-colors hover:text-red-300"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}

          {bots.length === 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
              No bots yet. Create one to get started.
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        title={editingBot ? 'Edit Bot' : 'Add New Bot'}
        onClose={closeModal}
        onSubmit={handleSubmitBot}
      >
        <input
          type="text"
          placeholder="Bot Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="API ID"
          value={formData.api_id}
          onChange={(e) => setFormData({ ...formData, api_id: e.target.value })}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="API Hash"
          value={formData.api_hash}
          onChange={(e) => setFormData({ ...formData, api_hash: e.target.value })}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="Bot Token"
          value={formData.bot_token}
          onChange={(e) => setFormData({ ...formData, bot_token: e.target.value })}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="Session Name"
          value={formData.session_name}
          onChange={(e) => setFormData({ ...formData, session_name: e.target.value })}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
      </Modal>
    </div>
  )
}
