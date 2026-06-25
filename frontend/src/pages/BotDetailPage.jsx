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

  if (loading) return <div className="p-4 text-center text-gray-300 sm:p-8">Loading...</div>
  if (!bot) return <div className="p-4 text-center text-red-400 sm:p-8">Bot not found</div>

  const availableChannels = channels.filter(
    (ch) => !botChannels.some((bc) => bc.id === ch.id)
  )

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="break-words text-2xl font-bold text-white sm:text-3xl">{bot.name}</h1>
        <p className="mt-1 text-sm text-gray-400">Review bot details and linked source channels.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3 xl:gap-8">
        {/* Bot Info */}
        <div className="xl:col-span-1">
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Bot Info</h2>
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-gray-400">Status:</span>{' '}
                <span className={bot.is_active ? 'text-green-400' : 'text-red-400'}>
                  {bot.is_active ? 'Active' : 'Inactive'}
                </span>
              </p>
              <p>
                <span className="text-gray-400">API ID:</span>{' '}
                <span className="break-all text-gray-200">{bot.api_id}</span>
              </p>
              <p>
                <span className="text-gray-400">Created:</span>{' '}
                {new Date(bot.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Linked Channels */}
        <div className="xl:col-span-2">
          <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Linked Channels</h2>
            <div className="space-y-2">
              {botChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-gray-700 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{channel.name}</p>
                    <p className="truncate text-xs text-gray-400">{channel.channel_handle}</p>
                  </div>
                  <button
                    onClick={() => handleUnlinkChannel(channel.id)}
                    className="shrink-0 rounded-lg p-2 text-red-400 transition-colors hover:bg-gray-600 hover:text-red-300"
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
                    className="flex w-full items-center justify-between gap-3 rounded-lg bg-gray-700 p-3 text-left transition-colors hover:bg-gray-600"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{channel.name}</p>
                      <p className="truncate text-xs text-gray-400">{channel.channel_handle}</p>
                    </div>
                    <Link size={18} className="shrink-0 text-blue-400" />
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
