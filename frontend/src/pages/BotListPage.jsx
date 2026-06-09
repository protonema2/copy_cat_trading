import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Eye, Power } from 'lucide-react'
import { botApi } from '../api'
import Modal from '../components/Modal'

export default function BotListPage({ bots, onRefresh, loading }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    api_id: '',
    api_hash: '',
    bot_token: '',
  })

  const handleCreateBot = async () => {
    try {
      await botApi.create(formData)
      setIsModalOpen(false)
      setFormData({ name: '', api_id: '', api_hash: '', bot_token: '' })
      onRefresh()
    } catch (error) {
      alert('Failed to create bot: ' + error.message)
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Bots</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          New Bot
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="bg-gray-800 rounded-lg p-4 flex items-center justify-between border border-gray-700"
            >
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{bot.name}</h3>
                <p className="text-sm text-gray-400">
                  {bot.is_active ? (
                    <span className="text-green-400">● Active</span>
                  ) : (
                    <span className="text-red-400">● Inactive</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href={`/bots/${bot.id}`}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="View details"
                >
                  <Eye size={20} />
                </a>
                <button
                  onClick={() => handleToggleBot(bot.id)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title={bot.is_active ? 'Deactivate' : 'Activate'}
                >
                  <Power size={20} />
                </button>
                <button
                  onClick={() => handleDeleteBot(bot.id)}
                  className="p-2 text-red-400 hover:text-red-600 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}

          {bots.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              No bots yet. Create one to get started.
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        title="Add New Bot"
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateBot}
      >
        <input
          type="text"
          placeholder="Bot Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="API ID"
          value={formData.api_id}
          onChange={(e) => setFormData({ ...formData, api_id: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="API Hash"
          value={formData.api_hash}
          onChange={(e) => setFormData({ ...formData, api_hash: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Bot Token"
          value={formData.bot_token}
          onChange={(e) => setFormData({ ...formData, bot_token: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </Modal>
    </div>
  )
}
