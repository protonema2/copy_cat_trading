import React, { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { instrumentSymbolApi } from '../api'

function Row({ item, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(item.display_name)
  const [feedSymbol, setFeedSymbol] = useState(item.price_feed_symbol)
  const [active, setActive] = useState(item.active)
  const [loading, setLoading] = useState(false)

  const save = async () => {
    setLoading(true)
    try {
      await onSave(item.id, { display_name: displayName, price_feed_symbol: feedSymbol, active })
      setEditing(false)
    } catch (e) {
      alert(e.response?.data?.detail ?? 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  const cancel = () => {
    setDisplayName(item.display_name)
    setFeedSymbol(item.price_feed_symbol)
    setActive(item.active)
    setEditing(false)
  }

  if (editing) {
    return (
      <tr className="border-b border-gray-700 bg-gray-800/60">
        <td className="py-2 pr-3">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded bg-gray-700 px-2 py-1 text-sm text-gray-200 focus:outline-none"
          />
        </td>
        <td className="py-2 pr-3">
          <input
            value={feedSymbol}
            onChange={(e) => setFeedSymbol(e.target.value)}
            className="w-full rounded bg-gray-700 px-2 py-1 text-sm text-gray-200 focus:outline-none"
          />
        </td>
        <td className="py-2 pr-3">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </td>
        <td className="py-2 flex gap-1">
          <button
            onClick={save}
            disabled={loading}
            className="rounded bg-blue-700 p-1.5 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button onClick={cancel} className="rounded bg-gray-600 p-1.5 text-white hover:bg-gray-500">
            <X size={14} />
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-2 pr-3 text-sm text-gray-200">{item.display_name}</td>
      <td className="py-2 pr-3 text-sm font-mono text-gray-300">{item.price_feed_symbol}</td>
      <td className="py-2 pr-3">
        <span className={`rounded px-2 py-0.5 text-xs ${item.active ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-500'}`}>
          {item.active ? 'active' : 'inactive'}
        </span>
      </td>
      <td className="py-2 flex gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded bg-gray-700 p-1.5 text-gray-300 hover:bg-gray-600 hover:text-white"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="rounded bg-gray-700 p-1.5 text-gray-300 hover:bg-red-700 hover:text-white"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}

export default function InstrumentSymbolsPage() {
  const [symbols, setSymbols] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newDisplay, setNewDisplay] = useState('')
  const [newFeed, setNewFeed] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await instrumentSymbolApi.list()
      setSymbols(res.data)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (id, data) => {
    await instrumentSymbolApi.update(id, data)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this mapping?')) return
    try {
      await instrumentSymbolApi.delete(id)
      load()
    } catch (e) {
      alert(e.response?.data?.detail ?? 'Delete failed')
    }
  }

  const handleAdd = async () => {
    if (!newDisplay.trim() || !newFeed.trim()) return
    setAddLoading(true)
    try {
      await instrumentSymbolApi.create({ display_name: newDisplay.trim(), price_feed_symbol: newFeed.trim() })
      setNewDisplay('')
      setNewFeed('')
      setAdding(false)
      load()
    } catch (e) {
      alert(e.response?.data?.detail ?? 'Create failed')
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Instrument Symbol Mappings</h1>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-600"
        >
          <Plus size={15} /> Add mapping
        </button>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Maps operator-typed names (e.g. <span className="font-mono text-gray-400">GOLD</span>,{' '}
        <span className="font-mono text-gray-400">XAUUSD</span>) to TwelveData price-feed symbols
        (e.g. <span className="font-mono text-gray-400">XAU/USD</span>). Signals with a matching{' '}
        <em>emiten</em> will have their <em>price_feed_symbol</em> set automatically.
      </p>

      {adding && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3">
          <input
            value={newDisplay}
            onChange={(e) => setNewDisplay(e.target.value)}
            placeholder="Display name (e.g. XAUUSD)"
            className="flex-1 rounded bg-gray-700 px-2 py-1.5 text-sm text-gray-200 focus:outline-none"
          />
          <input
            value={newFeed}
            onChange={(e) => setNewFeed(e.target.value)}
            placeholder="Price feed symbol (e.g. XAU/USD)"
            className="flex-1 rounded bg-gray-700 px-2 py-1.5 text-sm text-gray-200 focus:outline-none font-mono"
          />
          <button
            onClick={handleAdd}
            disabled={addLoading || !newDisplay.trim() || !newFeed.trim()}
            className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {addLoading ? 'Adding…' : 'Add'}
          </button>
          <button
            onClick={() => setAdding(false)}
            className="rounded bg-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : symbols.length === 0 ? (
        <p className="text-gray-500">No mappings configured yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-xs text-gray-500">
                <th className="pb-2 pr-3">Display name</th>
                <th className="pb-2 pr-3">Price feed symbol</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((item) => (
                <Row key={item.id} item={item} onSave={handleSave} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
