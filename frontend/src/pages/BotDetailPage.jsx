import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Link, Unlink } from 'lucide-react'
import { botApi, channelApi, linkApi } from '../api'

export default function BotDetailPage({ onRefresh }) {
  const { botId } = useParams()
  const [bot, setBot] = useState(null)
  const [channels, setChannels] = useState([])
  const [botChannels, setBotChannels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBotDetails()
    fetchChannels()
  }, [botId])

  const fetchBotDetails = async () => {
    try {
      const response = await botApi.get(botId)
      setBot(response.data)
      setBotChannels(response.data.channels || [])
    } catch (error) {
      console.error('Failed to fetch bot details:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchChannels = async () => {
    try {
      const response = await channelApi.list()
      setChannels(response.data)
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    }
  }

  const handleLinkChannel = async (channelId) => {
    try {
      await linkApi.link(botId, channelId)
      fetchBotDetails()
      onRefresh()
    } catch (error) {
      alert('Failed to link channel: ' + error.message)
    }
  }

  const handleUnlinkChannel = async (channelId) => {
    try {
      await linkApi.unlink(botId, channelId)
      fetchBotDetails()
      onRefresh()
    } catch (error) {
      alert('Failed to unlink channel: ' + error.message)
    }
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!bot) return <div className="p-8 text-center text-red-400">Bot not found</div>

  const availableChannels = channels.filter(
    (ch) => !botChannels.some((bc) => bc.id === ch.id)
  )

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-8">{bot.name}</h1>

      <div className="grid grid-cols-3 gap-8">
        {/* Bot Info */}
        <div className="col-span-1">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Bot Info</h2>
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-gray-400">Status:</span>{' '}
                <span className={bot.is_active ? 'text-green-400' : 'text-red-400'}>
                  {bot.is_active ? 'Active' : 'Inactive'}
                </span>
              </p>
              <p>
                <span className="text-gray-400">API ID:</span> {bot.api_id}
              </p>
              <p>
                <span className="text-gray-400">Created:</span>{' '}
                {new Date(bot.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Linked Channels */}
        <div className="col-span-2">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Linked Channels</h2>
            <div className="space-y-2">
              {botChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-white">{channel.name}</p>
                    <p className="text-xs text-gray-400">{channel.channel_handle}</p>
                  </div>
                  <button
                    onClick={() => handleUnlinkChannel(channel.id)}
                    className="p-2 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Unlink size={18} />
                  </button>
                </div>
              ))}

              {botChannels.length === 0 && (
                <p className="text-gray-400 text-sm">No channels linked yet</p>
              )}
            </div>

            {availableChannels.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-gray-400 mb-2">Available channels:</p>
                {availableChannels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleLinkChannel(channel.id)}
                    className="w-full flex items-center justify-between p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-left"
                  >
                    <div>
                      <p className="font-medium text-white">{channel.name}</p>
                      <p className="text-xs text-gray-400">{channel.channel_handle}</p>
                    </div>
                    <Link size={18} className="text-blue-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
