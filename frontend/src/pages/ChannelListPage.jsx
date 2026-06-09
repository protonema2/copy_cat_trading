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
  const [rulePreviews, setRulePreviews] = useState({})
  const [formData, setFormData] = useState({
    name: '',
    channel_handle: '',
    target_channel: '',
    forward_message: true,
    copy_settings: [createEmptyCopySetting()],
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
    target_channel: formData.forward_message ? formData.target_channel : '',
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
      await channelApi.postMessage(channelId, message)
      setIsPostModalOpen(false)
      setSelectedChannel(null)
      setPostMessage('')
      refreshChannelLogs(channelId)
    } catch (error) {
      alert('Failed to post message: ' + getErrorMessage(error))
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Channels</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setIsLinkModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <LinkIcon size={20} />
            Link Bot to Channel
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            New Channel
          </button>
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No channels yet. Create one to get started.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6">
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
                className={`text-left bg-gray-800 rounded-lg p-4 border transition-colors ${
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
                      {channel.forward_message ? `Target: ${channel.target_channel}` : 'Forward message disabled'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                      title="Edit channel"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteChannel(channel.id)
                      }}
                      className="p-2 text-red-400 hover:text-red-600 transition-colors"
                      title="Delete channel"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-400">
                  <span>{channel.copy_settings?.length || 0} filters</span>
                  <span>{channel.logs?.length || 0} activities</span>
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
        title={`Post to ${selectedChannel?.target_channel || 'Destination'}`}
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
      </Modal>
    </div>
  )
}

function ChannelActivityPanel({ channel, onRefresh, onEdit, onDelete, onPost }) {
  if (!channel) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-400">
        Select a channel to view activity.
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{channel.name}</h2>
            <p className="text-sm text-gray-400 mt-1">{channel.channel_handle}</p>
            <p className="text-sm text-gray-500 mt-1">
              {channel.forward_message ? `Target: ${channel.target_channel}` : 'Forward message disabled'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {channel.forward_message && channel.bots?.length > 0 && (
              <button
                onClick={() => onPost(channel)}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"
              >
                <Send size={16} />
                Post
              </button>
            )}
            <button
              onClick={() => onEdit(channel)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Edit channel"
            >
              <Pencil size={20} />
            </button>
            <button
              onClick={() => onDelete(channel.id)}
              className="p-2 text-red-400 hover:text-red-600 transition-colors"
              title="Delete channel"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
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
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2">Filtered Message Settings</p>
            <div className="space-y-2">
              {channel.copy_settings?.length > 0 ? (
                channel.copy_settings.map((setting) => (
                  <div key={setting.id} className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs">
                    <div className="bg-gray-900 rounded px-2 py-1 text-gray-300 break-words">
                      {setting.rule_name || setting.match_type}
                    </div>
                    <div className="bg-gray-900 rounded px-2 py-1 text-gray-200 whitespace-pre-wrap break-words">
                      {setting.filtered_message}
                    </div>
                    <div className="bg-gray-900 rounded px-2 py-1 text-gray-400 whitespace-pre-wrap break-words">
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

      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Channel Activity</h3>
          <button
            onClick={() => onRefresh(channel.id)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Refresh logs"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="max-h-[460px] overflow-y-auto rounded border border-gray-700">
          {channel.logs?.length > 0 ? (
            channel.logs.map((log) => (
              <div key={log.id} className="p-4 border-b border-gray-700 last:border-b-0 bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-100 break-words">{log.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 text-xs rounded ${
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
        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
      />
      <input
        type="text"
        placeholder="Channel Handle (@example)"
        value={formData.channel_handle}
        onChange={(e) => setFormData({ ...formData, channel_handle: e.target.value })}
        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
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
          <input
            type="text"
            placeholder="Target Channel (@target)"
            value={formData.target_channel}
            onChange={(e) => setFormData({ ...formData, target_channel: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
          />

          <div className="space-y-3">
            {formData.copy_settings.map((setting, index) => (
              <div key={index} className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3">
                <div className="grid grid-cols-[1fr_150px_36px] gap-2">
                  <input
                    type="text"
                    placeholder="Rule Name"
                    value={setting.rule_name}
                    onChange={(e) => updateCopySetting(index, 'rule_name', e.target.value)}
                    className="min-w-0 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <select
                    value={setting.match_type}
                    onChange={(e) => updateCopySetting(index, 'match_type', e.target.value)}
                    className="min-w-0 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="contains">Contains</option>
                    <option value="regex">Regex</option>
                    <option value="regex_multiline">Regex Multiline</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCopySetting(index)}
                    className="flex h-10 items-center justify-center rounded-lg bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600 transition-colors"
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
                      className="w-full min-w-0 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-y"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-gray-400 mb-1">Output Message</span>
                    <textarea
                      placeholder="BUY GOLD NOW! {{price}}"
                      value={setting.output_message}
                      onChange={(e) => updateCopySetting(index, 'output_message', e.target.value)}
                      rows={4}
                      className="w-full min-w-0 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-y"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <textarea
                    placeholder="Paste sample Telegram message to test this rule"
                    value={rulePreviews[index]?.sample_message || ''}
                    onChange={(e) => updateRulePreviewSample(index, e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-y"
                  />
                  <button
                    type="button"
                    onClick={() => previewCopySetting(index)}
                    className="px-3 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors"
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
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors"
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

function getErrorMessage(error) {
  return error.response?.data?.detail || error.message
}
