import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Link as LinkIcon, RefreshCw, Send, Pencil, X } from 'lucide-react'
import { channelApi, linkApi, botApi, ruleApi } from '../api'
import Modal from '../components/Modal'

const createEmptyCopySetting = (priority = 0) => ({
  rule_name: '',
  match_type: 'contains',
  filtered_message: '',
  output_message: '',
  priority,
})

const createEmptyDestination = () => ({
  destination_name: '',
  destination_handle: '',
  is_active: true,
  use_rule_output: true,
  custom_output_message: '',
})

export default function ChannelListPage({ onRefresh }) {
  const [channels, setChannels] = useState([])
  const [bots, setBots] = useState([])
  const [selectedChannelId, setSelectedChannelId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [isPostModalOpen, setIsPostModalOpen] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [editingChannel, setEditingChannel] = useState(null)
  const [postMessage, setPostMessage] = useState('')
  const [selectedDestinationIds, setSelectedDestinationIds] = useState([])
  const [rulePreviews, setRulePreviews] = useState({})
  const [formData, setFormData] = useState({
    name: '',
    channel_handle: '',
    target_channel: '',
    forward_message: true,
    copy_settings: [createEmptyCopySetting()],
    destinations: [createEmptyDestination()],
  })
  const [linkData, setLinkData] = useState({
    bot_id: '',
    channel_id: '',
  })

  useEffect(() => {
    fetchChannels()
    fetchBots()

    const interval = setInterval(fetchChannels, 5000)
    return () => clearInterval(interval)
  }, [])

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) || null,
    [channels, selectedChannelId]
  )

  const fetchChannels = async () => {
    try {
      const response = await channelApi.list()
      const mappedChannels = response.data.map((channel) => ({
        ...channel,
        logs: sortLogs(channel.logs || []),
      }))

      setChannels(mappedChannels)
      setSelectedChannelId((currentId) =>
        currentId && mappedChannels.some((channel) => channel.id === currentId)
          ? currentId
          : mappedChannels[0]?.id || null
      )
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    }
  }

  const fetchBots = async () => {
    try {
      const response = await botApi.list()
      setBots(response.data)
    } catch (error) {
      console.error('Failed to fetch bots:', error)
    }
  }

  const handleCreateChannel = async () => {
    try {
      const payload = buildChannelPayload()
      if (editingChannel) {
        await channelApi.update(editingChannel.id, payload)
      } else {
        await channelApi.create(payload)
      }

      setIsModalOpen(false)
      resetChannelForm()
      fetchChannels()
      onRefresh()
    } catch (error) {
      alert(`Failed to ${editingChannel ? 'update' : 'create'} channel: ` + getErrorMessage(error))
    }
  }

  const handleDeleteChannel = async (channelId) => {
    if (window.confirm('Are you sure you want to delete this channel?')) {
      try {
        await channelApi.delete(channelId)
        setSelectedChannelId((currentId) => (currentId === channelId ? null : currentId))
        fetchChannels()
      } catch (error) {
        alert('Failed to delete channel: ' + getErrorMessage(error))
      }
    }
  }

  const handleLinkChannel = async () => {
    try {
      await linkApi.link(linkData.bot_id, linkData.channel_id)
      setIsLinkModalOpen(false)
      setLinkData({ bot_id: '', channel_id: '' })
      fetchChannels()
      fetchBots()
    } catch (error) {
      alert('Failed to link channel: ' + getErrorMessage(error))
    }
  }

  const refreshChannelLogs = async (channelId) => {
    try {
      const response = await channelApi.getLogs(channelId, 100)
      setChannels((prev) =>
        prev.map((channel) =>
          channel.id === channelId ? { ...channel, logs: sortLogs(response.data) } : channel
        )
      )
    } catch (error) {
      alert('Failed to refresh channel logs: ' + getErrorMessage(error))
    }
  }

  const sortLogs = (logs) =>
    [...logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const resetChannelForm = () => {
    setEditingChannel(null)
    setFormData({
      name: '',
      channel_handle: '',
      target_channel: '',
      forward_message: true,
      copy_settings: [createEmptyCopySetting()],
      destinations: [createEmptyDestination()],
    })
    setRulePreviews({})
  }

  const openCreateModal = () => {
    resetChannelForm()
    setIsModalOpen(true)
  }

  const openEditModal = (channel) => {
    setEditingChannel(channel)
    setFormData({
      name: channel.name || '',
      channel_handle: channel.channel_handle || '',
      target_channel: channel.target_channel || '',
      forward_message: channel.forward_message !== false,
      destinations:
        channel.destinations && channel.destinations.length > 0
          ? channel.destinations.map((destination) => ({
              destination_name: destination.destination_name || '',
              destination_handle: destination.destination_handle || '',
              is_active: destination.is_active !== false,
              use_rule_output: destination.use_rule_output !== false,
              custom_output_message: destination.custom_output_message || '',
            }))
          : [
              {
                ...createEmptyDestination(),
                destination_name: channel.target_channel || '',
                destination_handle: channel.target_channel || '',
              },
            ],
      copy_settings:
        channel.copy_settings && channel.copy_settings.length > 0
          ? channel.copy_settings.map((setting) => ({
              filtered_message: setting.filtered_message || '',
              output_message: setting.output_message || '',
              rule_name: setting.rule_name || '',
              match_type: setting.match_type || 'contains',
              priority: setting.priority || 0,
            }))
          : [createEmptyCopySetting()],
    })
    setRulePreviews({})
    setIsModalOpen(true)
  }

  const buildChannelPayload = () => ({
    ...formData,
    target_channel: formData.forward_message ? firstDestinationHandle(formData.destinations) : '',
    destinations: formData.forward_message
      ? formData.destinations
          .map((destination) => ({
            destination_name: destination.destination_name.trim() || destination.destination_handle.trim(),
            destination_handle: destination.destination_handle.trim(),
            is_active: destination.is_active,
            use_rule_output: destination.use_rule_output,
            custom_output_message: destination.custom_output_message.trim(),
          }))
          .filter((destination) => destination.destination_handle)
      : [],
    copy_settings: formData.copy_settings
      .map((setting, index) => ({
        filtered_message: setting.filtered_message.trim(),
        output_message: setting.output_message.trim(),
        rule_name: setting.rule_name.trim(),
        match_type: setting.match_type,
        priority: index,
      }))
      .filter((setting) => setting.filtered_message),
  })

  const updateCopySetting = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      copy_settings: prev.copy_settings.map((setting, settingIndex) =>
        settingIndex === index ? { ...setting, [field]: value } : setting
      ),
    }))
  }

  const addCopySetting = () => {
    setFormData((prev) => ({
      ...prev,
      copy_settings: [...prev.copy_settings, createEmptyCopySetting(prev.copy_settings.length)],
    }))
  }

  const updateDestination = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      destinations: prev.destinations.map((destination, destinationIndex) =>
        destinationIndex === index ? { ...destination, [field]: value } : destination
      ),
    }))
  }

  const addDestination = () => {
    setFormData((prev) => ({
      ...prev,
      destinations: [...prev.destinations, createEmptyDestination()],
    }))
  }

  const removeDestination = (index) => {
    setFormData((prev) => ({
      ...prev,
      destinations:
        prev.destinations.length === 1
          ? [createEmptyDestination()]
          : prev.destinations.filter((_, destinationIndex) => destinationIndex !== index),
    }))
  }

  const removeCopySetting = (index) => {
    setFormData((prev) => ({
      ...prev,
      copy_settings:
        prev.copy_settings.length === 1
          ? [createEmptyCopySetting()]
          : prev.copy_settings.filter((_, settingIndex) => settingIndex !== index),
    }))
  }

  const updateRulePreviewSample = (index, value) => {
    setRulePreviews((prev) => ({
      ...prev,
      [index]: {
        ...(prev[index] || {}),
        sample_message: value,
      },
    }))
  }

  const previewCopySetting = async (index) => {
    const setting = formData.copy_settings[index]
    const sampleMessage = rulePreviews[index]?.sample_message || ''

    if (!setting.filtered_message.trim() || !sampleMessage.trim()) {
      alert('Filtered Message and sample message are required to test a rule')
      return
    }

    setRulePreviews((prev) => ({
      ...prev,
      [index]: { ...(prev[index] || {}), loading: true, error: null },
    }))

    try {
      const response = await ruleApi.preview({
        sample_message: sampleMessage,
        match_type: setting.match_type,
        filtered_message: setting.filtered_message,
        output_message: setting.output_message,
      })
      setRulePreviews((prev) => ({
        ...prev,
        [index]: {
          ...(prev[index] || {}),
          loading: false,
          result: response.data,
          error: response.data.error || null,
        },
      }))
    } catch (error) {
      setRulePreviews((prev) => ({
        ...prev,
        [index]: {
          ...(prev[index] || {}),
          loading: false,
          error: getErrorMessage(error),
        },
      }))
    }
  }

  const openPostModal = (channel) => {
    setSelectedChannel(channel)
    setPostMessage('')
    setSelectedDestinationIds((channel.destinations || []).filter((destination) => destination.is_active).map((destination) => destination.id))
    setIsPostModalOpen(true)
  }

  const handlePostMessage = async () => {
    if (!selectedChannel) return

    const message = postMessage.trim()
    if (!message) {
      alert('Message cannot be empty')
      return
    }

    try {
      const channelId = selectedChannel.id
      await channelApi.postMessage(channelId, message, selectedDestinationIds)
      setIsPostModalOpen(false)
      setSelectedChannel(null)
      setPostMessage('')
      setSelectedDestinationIds([])
      refreshChannelLogs(channelId)
    } catch (error) {
      alert('Failed to post message: ' + getErrorMessage(error))
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Channels</h1>
          <p className="mt-1 text-sm text-gray-400">Configure source channels, targets, rules, and activity logs.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:flex">
          <button
            onClick={() => setIsLinkModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
          >
            <LinkIcon size={20} />
            Link Bot to Channel
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={20} />
            New Channel
          </button>
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
          No channels yet. Create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 content-start">
            {channels.map((channel) => (
              <div
                key={channel.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedChannelId(channel.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedChannelId(channel.id)
                  }
                }}
                className={`rounded-lg border bg-gray-800 p-4 text-left transition-colors ${
                  selectedChannelId === channel.id
                    ? 'border-blue-500 ring-1 ring-blue-500'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">{channel.name}</h3>
                    <p className="text-sm text-gray-400 truncate">{channel.channel_handle}</p>
                    <p className="text-sm text-gray-500 truncate">
                      {channel.forward_message
                        ? `${channel.destinations?.filter((destination) => destination.is_active).length || 0} active destinations`
                        : 'Forward message disabled'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        channel.forward_message
                          ? 'bg-green-900 text-green-200'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {channel.forward_message ? 'Forward' : 'Off'}
                    </span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        openEditModal(channel)
                      }}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                      title="Edit channel"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteChannel(channel.id)
                      }}
                      className="rounded-lg p-2 text-red-400 transition-colors hover:bg-gray-700 hover:text-red-300"
                      title="Delete channel"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-400">
                  <span>{channel.copy_settings?.length || 0} filters</span>
                  <span>{channel.logs?.length || 0} activities</span>
                  <span>{channel.destinations?.length || 0} destinations</span>
                  <span>{channel.bots?.length || 0} bots</span>
                </div>
              </div>
            ))}
          </div>

          <ChannelActivityPanel
            channel={activeChannel}
            onRefresh={refreshChannelLogs}
            onEdit={openEditModal}
            onDelete={handleDeleteChannel}
            onPost={openPostModal}
          />
        </div>
      )}

      <ChannelFormModal
        isOpen={isModalOpen}
        editingChannel={editingChannel}
        formData={formData}
        setFormData={setFormData}
        onClose={() => {
          setIsModalOpen(false)
          resetChannelForm()
        }}
        onSubmit={handleCreateChannel}
        updateCopySetting={updateCopySetting}
        addCopySetting={addCopySetting}
        removeCopySetting={removeCopySetting}
        rulePreviews={rulePreviews}
        updateRulePreviewSample={updateRulePreviewSample}
        previewCopySetting={previewCopySetting}
        updateDestination={updateDestination}
        addDestination={addDestination}
        removeDestination={removeDestination}
      />

      <Modal
        isOpen={isLinkModalOpen}
        title="Link Bot to Channel"
        onClose={() => setIsLinkModalOpen(false)}
        onSubmit={handleLinkChannel}
      >
        <select
          value={linkData.bot_id}
          onChange={(e) => setLinkData({ ...linkData, bot_id: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select a Bot</option>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.name}
            </option>
          ))}
        </select>
        <select
          value={linkData.channel_id}
          onChange={(e) => setLinkData({ ...linkData, channel_id: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select a Channel</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </Modal>

      <Modal
        isOpen={isPostModalOpen}
        title={`Post to ${selectedChannel?.name || 'Channel Destinations'}`}
        onClose={() => setIsPostModalOpen(false)}
        onSubmit={handlePostMessage}
      >
        <textarea
          placeholder="Write a message to post..."
          value={postMessage}
          onChange={(e) => setPostMessage(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
        />
        <DestinationSelector
          destinations={selectedChannel?.destinations || []}
          selectedDestinationIds={selectedDestinationIds}
          setSelectedDestinationIds={setSelectedDestinationIds}
        />
      </Modal>
    </div>
  )
}

function ChannelActivityPanel({ channel, onRefresh, onEdit, onDelete, onPost }) {
  if (!channel) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
        Select a channel to view activity.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold text-white sm:text-2xl">{channel.name}</h2>
            <p className="text-sm text-gray-400 mt-1">{channel.channel_handle}</p>
            <p className="mt-1 break-words text-sm text-gray-500">
              {channel.forward_message
                ? `${channel.destinations?.filter((destination) => destination.is_active).length || 0} active destinations`
                : 'Forward message disabled'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {channel.forward_message && channel.bots?.length > 0 && (
              <button
                onClick={() => onPost(channel)}
                className="flex items-center justify-center gap-2 rounded bg-indigo-600 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-700"
              >
                <Send size={16} />
                Post
              </button>
            )}
            <button
              onClick={() => onEdit(channel)}
              className="flex items-center justify-center rounded-lg bg-gray-700 p-2 text-gray-300 transition-colors hover:text-white"
              title="Edit channel"
            >
              <Pencil size={20} />
            </button>
            <button
              onClick={() => onDelete(channel.id)}
              className="flex items-center justify-center rounded-lg bg-gray-700 p-2 text-red-400 transition-colors hover:text-red-300"
              title="Delete channel"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 mb-2">Linked Bots</p>
            <div className="flex flex-wrap gap-2">
              {channel.bots?.length > 0 ? (
                channel.bots.map((bot) => (
                  <span key={bot.id} className="px-2 py-1 bg-blue-600 text-xs text-white rounded">
                    {bot.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">No linked bots</span>
              )}
            </div>

            <p className="mb-2 mt-4 text-xs text-gray-400">Destinations</p>
            <div className="space-y-2">
              {channel.destinations?.length > 0 ? (
                channel.destinations.map((destination) => (
                  <div key={destination.id} className="rounded bg-gray-900 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-gray-200">{destination.destination_name}</span>
                      <span className={destination.is_active ? 'text-green-300' : 'text-gray-500'}>
                        {destination.is_active ? 'Active' : 'Off'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-gray-500">{destination.destination_handle}</p>
                    <p className="mt-1 text-gray-400">
                      {destination.use_rule_output ? 'Use Rule Output' : 'Custom Output'}
                    </p>
                  </div>
                ))
              ) : (
                <span className="text-sm text-gray-500">No destinations configured</span>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs text-gray-400 mb-2">Filtered Message Settings</p>
            <div className="space-y-2">
              {channel.copy_settings?.length > 0 ? (
                channel.copy_settings.map((setting) => (
                  <div
                    key={setting.id}
                    className="grid min-w-0 gap-2 text-xs md:grid-cols-[minmax(96px,0.65fr)_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <div className="min-w-0 rounded bg-gray-900 px-3 py-2 text-gray-300 break-all">
                      {setting.rule_name || setting.match_type}
                    </div>
                    <div className="min-w-0 whitespace-pre-wrap rounded bg-gray-900 px-3 py-2 text-gray-200 break-all">
                      {setting.filtered_message}
                    </div>
                    <div className="min-w-0 whitespace-pre-wrap rounded bg-gray-900 px-3 py-2 text-gray-400 break-all">
                      {setting.output_message || setting.filtered_message}
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-sm text-gray-500">No filters configured</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white sm:text-xl">Channel Activity</h3>
          <button
            onClick={() => onRefresh(channel.id)}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            title="Refresh logs"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="max-h-[460px] overflow-y-auto rounded border border-gray-700">
          {channel.logs?.length > 0 ? (
            channel.logs.map((log) => (
              <div key={log.id} className="p-4 border-b border-gray-700 last:border-b-0 bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-100 break-words">{log.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(log.created_at).toLocaleString()}
                      {log.delay_seconds !== null && log.delay_seconds !== undefined
                        ? ` - Telegram delay ${log.delay_seconds}s`
                        : ''}
                    </p>
                  </div>
                  <span
                    className={`w-fit shrink-0 rounded px-2 py-1 text-xs ${
                      log.log_type === 'signal_sent' || log.log_type === 'template_sent'
                        ? 'bg-green-900 text-green-200'
                        : log.log_type === 'error'
                        ? 'bg-red-900 text-red-200'
                        : 'bg-blue-900 text-blue-200'
                    }`}
                  >
                    {log.log_type}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-400 bg-gray-900">No channel activity yet</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChannelFormModal({
  isOpen,
  editingChannel,
  formData,
  setFormData,
  onClose,
  onSubmit,
  updateCopySetting,
  addCopySetting,
  removeCopySetting,
  rulePreviews,
  updateRulePreviewSample,
  previewCopySetting,
  updateDestination,
  addDestination,
  removeDestination,
}) {
  return (
    <Modal
      isOpen={isOpen}
      title={editingChannel ? 'Edit Channel' : 'Add New Channel'}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <input
        type="text"
        placeholder="Channel Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
      />
      <input
        type="text"
        placeholder="Channel Handle (@example)"
        value={formData.channel_handle}
        onChange={(e) => setFormData({ ...formData, channel_handle: e.target.value })}
        className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
      />

      <label className="flex items-center gap-3 text-sm text-gray-200">
        <input
          type="checkbox"
          checked={formData.forward_message}
          onChange={(e) => setFormData({ ...formData, forward_message: e.target.checked })}
          className="h-4 w-4"
        />
        <span>Forward Message</span>
      </label>

      {formData.forward_message && (
        <>
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-sm font-semibold text-white">Destinations</p>
              <div className="space-y-3">
                {formData.destinations.map((destination, index) => (
                  <div key={index} className="space-y-3 rounded-lg border border-gray-700 bg-gray-900 p-3 sm:p-4">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px]">
                      <input
                        type="text"
                        placeholder="Destination Name"
                        value={destination.destination_name}
                        onChange={(e) => updateDestination(index, 'destination_name', e.target.value)}
                        className="min-w-0 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Destination Handle (@target)"
                        value={destination.destination_handle}
                        onChange={(e) => updateDestination(index, 'destination_handle', e.target.value)}
                        className="min-w-0 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeDestination(index)}
                        className="flex h-10 items-center justify-center rounded-lg bg-gray-700 text-gray-300 transition-colors hover:bg-gray-600 hover:text-white"
                        title="Remove destination"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-3 text-sm text-gray-200">
                        <input
                          type="checkbox"
                          checked={destination.is_active}
                          onChange={(e) => updateDestination(index, 'is_active', e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span>Active</span>
                      </label>
                      <label className="flex items-center gap-3 text-sm text-gray-200">
                        <input
                          type="checkbox"
                          checked={destination.use_rule_output}
                          onChange={(e) => updateDestination(index, 'use_rule_output', e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span>Use Rule Output Message</span>
                      </label>
                    </div>

                    {!destination.use_rule_output && (
                      <label className="block">
                        <span className="mb-1 block text-xs text-gray-400">Custom Output Message</span>
                        <textarea
                          placeholder="VIP ALERT: {{direction}} GOLD {{price}}"
                          value={destination.custom_output_message}
                          onChange={(e) => updateDestination(index, 'custom_output_message', e.target.value)}
                          rows={3}
                          className="w-full resize-y rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addDestination}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600 sm:w-auto"
              >
                <Plus size={16} />
                Add Destination
              </button>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-white">Filtered Message Settings</p>
            </div>
            {formData.copy_settings.map((setting, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-gray-700 bg-gray-900 p-3 sm:p-4">
                <div className="grid gap-2 sm:grid-cols-[1fr_160px_40px]">
                  <input
                    type="text"
                    placeholder="Rule Name"
                    value={setting.rule_name}
                    onChange={(e) => updateCopySetting(index, 'rule_name', e.target.value)}
                    className="min-w-0 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                  <select
                    value={setting.match_type}
                    onChange={(e) => updateCopySetting(index, 'match_type', e.target.value)}
                    className="min-w-0 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
                  >
                    <option value="contains">Contains</option>
                    <option value="regex">Regex</option>
                    <option value="regex_multiline">Regex Multiline</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCopySetting(index)}
                    className="flex h-10 items-center justify-center rounded-lg bg-gray-700 text-gray-300 transition-colors hover:bg-gray-600 hover:text-white"
                    title="Remove setting"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="block text-xs text-gray-400 mb-1">Filtered Message</span>
                    <textarea
                      placeholder={
                        setting.match_type === 'contains'
                          ? 'READY FOR THE SIGNAL'
                          : 'GOLD BUY NOW (?P<price>\\d+)'
                      }
                      value={setting.filtered_message}
                      onChange={(e) => updateCopySetting(index, 'filtered_message', e.target.value)}
                      rows={4}
                      className="w-full min-w-0 resize-y rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-gray-400 mb-1">Output Message</span>
                    <textarea
                      placeholder="BUY GOLD NOW! {{price}}"
                      value={setting.output_message}
                      onChange={(e) => updateCopySetting(index, 'output_message', e.target.value)}
                      rows={4}
                      className="w-full min-w-0 resize-y rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white outline-none focus:border-blue-500"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <textarea
                    placeholder="Paste sample Telegram message to test this rule"
                    value={rulePreviews[index]?.sample_message || ''}
                    onChange={(e) => updateRulePreviewSample(index, e.target.value)}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => previewCopySetting(index)}
                    className="w-full rounded-lg bg-gray-700 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600 sm:w-auto"
                  >
                    {rulePreviews[index]?.loading ? 'Testing...' : 'Test Rule'}
                  </button>
                  {rulePreviews[index]?.error && (
                    <div className="rounded bg-red-950 px-3 py-2 text-sm text-red-200">
                      {rulePreviews[index].error}
                    </div>
                  )}
                  {rulePreviews[index]?.result && !rulePreviews[index]?.error && (
                    <div className="rounded bg-gray-800 px-3 py-2 text-sm">
                      <p className={rulePreviews[index].result.matched ? 'text-green-300' : 'text-gray-400'}>
                        {rulePreviews[index].result.matched ? 'Matched' : 'No match'}
                      </p>
                      {rulePreviews[index].result.output_message && (
                        <pre className="mt-2 whitespace-pre-wrap break-words text-gray-100 font-sans">
                          {rulePreviews[index].result.output_message}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addCopySetting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600 sm:w-auto"
            >
              <Plus size={16} />
              Add Filtered Message
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function DestinationSelector({ destinations, selectedDestinationIds, setSelectedDestinationIds }) {
  const activeDestinations = destinations.filter((destination) => destination.is_active)
  const allSelected =
    activeDestinations.length > 0 &&
    activeDestinations.every((destination) => selectedDestinationIds.includes(destination.id))

  const toggleDestination = (destinationId) => {
    setSelectedDestinationIds((current) =>
      current.includes(destinationId)
        ? current.filter((id) => id !== destinationId)
        : [...current, destinationId]
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-white">Destinations</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedDestinationIds(activeDestinations.map((destination) => destination.id))}
            className="rounded bg-gray-700 px-3 py-1 text-xs text-gray-200 transition-colors hover:bg-gray-600"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => setSelectedDestinationIds([])}
            className="rounded bg-gray-700 px-3 py-1 text-xs text-gray-200 transition-colors hover:bg-gray-600"
          >
            Clear
          </button>
        </div>
      </div>

      {activeDestinations.length > 0 ? (
        <div className="space-y-2">
          {activeDestinations.map((destination) => (
            <label key={destination.id} className="flex items-start gap-3 rounded bg-gray-800 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selectedDestinationIds.includes(destination.id)}
                onChange={() => toggleDestination(destination.id)}
                className="mt-1 h-4 w-4"
              />
              <span className="min-w-0">
                <span className="block truncate text-gray-100">{destination.destination_name}</span>
                <span className="block truncate text-xs text-gray-500">{destination.destination_handle}</span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No active destinations configured.</p>
      )}

      <p className="text-xs text-gray-500">
        {allSelected ? 'All active destinations selected.' : `${selectedDestinationIds.length} destination(s) selected.`}
      </p>
    </div>
  )
}

function firstDestinationHandle(destinations) {
  const activeDestination = (destinations || []).find(
    (destination) => destination.is_active && destination.destination_handle?.trim()
  )
  if (activeDestination) return activeDestination.destination_handle.trim()

  const firstDestination = (destinations || []).find((destination) => destination.destination_handle?.trim())
  return firstDestination ? firstDestination.destination_handle.trim() : ''
}

function getErrorMessage(error) {
  return error.response?.data?.detail || error.message
}
