import React, { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Scissors } from 'lucide-react'
import { signalApi, botApi, channelApi } from '../api'
import Modal from '../components/Modal'

const STATUS_STYLES = {
  OPEN:    'bg-blue-900/50 text-blue-300',
  TP_HIT:  'bg-green-900/50 text-green-300',
  SL_HIT:  'bg-red-900/50 text-red-300',
  CLOSED:  'bg-gray-700 text-gray-300',
}

const TYPE_STYLES = {
  BUY:  'bg-emerald-900/50 text-emerald-300',
  SELL: 'bg-rose-900/50 text-rose-300',
}

function StatusBadge({ status }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  )
}

function TypeBadge({ type }) {
  if (!type) return <span className="text-gray-500 text-xs">—</span>
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[type] ?? 'bg-gray-700 text-gray-300'}`}>
      {type}
    </span>
  )
}

function TargetDots({ targets }) {
  if (!targets || targets.length === 0) return <span className="text-gray-500 text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {targets.map((t) => (
        <span
          key={t.id}
          title={`${t.label}: ${t.price}${t.achieved ? ` ✓ ${t.achieved_by ?? ''}` : ''}`}
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            t.achieved ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-400'
          }`}
        >
          {t.label}{t.achieved ? ' ✓' : ' ○'}
          {t.achieved && t.achieved_by === 'AUTO' && (
            <span className="ml-0.5 text-[10px] text-gray-400">A</span>
          )}
        </span>
      ))}
    </div>
  )
}

function SLBroadcastBanner({ signals, onConfirm }) {
  if (!signals || signals.length === 0) return null
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-700 bg-red-900/30 p-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-300">
          {signals.length} auto-detected SL hit{signals.length > 1 ? 's' : ''} awaiting broadcast confirmation
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {signals.map((s) => (
            <button
              key={s.id}
              onClick={() => onConfirm(s)}
              className="rounded bg-red-700 px-2 py-1 text-xs text-white hover:bg-red-600"
            >
              {s.emiten ?? `Signal #${s.id}`} ({s.signal_type})
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SignalsPage() {
  const [signals, setSignals] = useState([])
  const [pending, setPending] = useState([])
  const [bots, setBots] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filterBot, setFilterBot] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // SL broadcast modal
  const [slModal, setSlModal] = useState(null) // signal object
  const [slMessage, setSlMessage] = useState('')
  const [slDestIds, setSlDestIds] = useState([])
  const [slLoading, setSlLoading] = useState(false)

  // Cut Profit / Cut Loss modal
  const [cutModal, setCutModal] = useState(null) // signal object
  const [cutPrice, setCutPrice] = useState('')
  const [cutMessage, setCutMessage] = useState('')
  const [cutDestIds, setCutDestIds] = useState([])
  const [cutLoading, setCutLoading] = useState(false)

  // Expanded rows (show raw message)
  const [expanded, setExpanded] = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (filterBot) params.bot_id = filterBot
      if (filterChannel) params.channel_id = filterChannel
      if (filterStatus) params.status = filterStatus

      const [sigRes, pendRes, botRes, chRes] = await Promise.all([
        signalApi.list(params),
        signalApi.pendingBroadcasts(),
        botApi.list(),
        channelApi.list(),
      ])
      setSignals(sigRes.data)
      setPending(pendRes.data)
      setBots(botRes.data)
      setChannels(chRes.data)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Failed to load signals')
    } finally {
      setLoading(false)
    }
  }, [filterBot, filterChannel, filterStatus])

  useEffect(() => { load() }, [load])

  const openSlModal = (signal) => {
    setSlModal(signal)
    setSlMessage(
      `⛔ SL Hit\n${signal.emiten ?? 'Signal'} ${signal.signal_type ?? ''}\nEntry: ${signal.entry_price ?? '—'}  SL: ${signal.stop_loss ?? '—'}`
    )
    setSlDestIds([])
  }

  const submitSlHit = async () => {
    if (!slModal) return
    setSlLoading(true)
    try {
      await signalApi.markSLHit(slModal.id, slMessage || null, slDestIds.length ? slDestIds : null)
      setSlModal(null)
      load()
    } catch (e) {
      alert(e.response?.data?.detail ?? 'Failed to mark SL hit')
    } finally {
      setSlLoading(false)
    }
  }

  const achieveTarget = async (signal, target) => {
    if (!confirm(`Mark ${target.label} on ${signal.emiten ?? `Signal #${signal.id}`} as achieved?`)) return
    try {
      await signalApi.achieveTarget(signal.id, target.id, 'MANUAL')
      load()
    } catch (e) {
      alert(e.response?.data?.detail ?? 'Failed')
    }
  }

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const openCutModal = (signal) => {
    setCutModal(signal)
    setCutPrice('')
    setCutMessage('')
    setCutDestIds([])
  }

  const cutType = (signal, price) => {
    if (!signal || price == null || signal.entry_price == null) return 'CLOSED'
    const isBuy = (signal.signal_type || '').toUpperCase() === 'BUY'
    const inProfit = isBuy ? price > signal.entry_price : price < signal.entry_price
    return inProfit ? 'CUT_PROFIT' : 'CUT_LOSS'
  }

  const cutLabel = (signal, price) => {
    const t = cutType(signal, price)
    if (t === 'CUT_PROFIT') return 'Cut Profit'
    if (t === 'CUT_LOSS') return 'Cut Loss'
    return 'Cut'
  }

  const submitCut = async () => {
    if (!cutModal) return
    setCutLoading(true)
    const exitPrice = cutPrice !== '' ? parseFloat(cutPrice) : null
    const type = cutType(cutModal, exitPrice)
    try {
      await signalApi.closeSignal(
        cutModal.id,
        exitPrice,
        type,
        cutMessage || null,
        cutDestIds.length ? cutDestIds : null,
      )
      setCutModal(null)
      load()
    } catch (e) {
      alert(e.response?.data?.detail ?? 'Failed to close signal')
    } finally {
      setCutLoading(false)
    }
  }

  // Destination checkboxes for the SL modal
  const channelForModal = slModal ? channels.find((c) => c.id === slModal.channel_id) : null
  const modalDestinations = channelForModal?.destinations ?? []

  // Destination checkboxes for the Cut modal
  const channelForCut = cutModal ? channels.find((c) => c.id === cutModal.channel_id) : null
  const cutDestinations = channelForCut?.destinations ?? []

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold text-white">Signals</h1>

      <SLBroadcastBanner signals={pending} onConfirm={openSlModal} />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filterBot}
          onChange={(e) => setFilterBot(e.target.value)}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-200 focus:outline-none"
        >
          <option value="">All bots</option>
          {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-200 focus:outline-none"
        >
          <option value="">All channels</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-200 focus:outline-none"
        >
          <option value="">All statuses</option>
          {['OPEN', 'TP_HIT', 'SL_HIT', 'CLOSED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={load} className="rounded bg-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-500">
          Refresh
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : signals.length === 0 ? (
        <p className="text-gray-400">No signals found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-300">
            <thead>
              <tr className="border-b border-gray-700 text-left text-xs text-gray-500">
                <th className="pb-2 pr-4">Instrument</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Entry</th>
                <th className="pb-2 pr-4">SL</th>
                <th className="pb-2 pr-4">Targets</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Created</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((sig) => (
                <React.Fragment key={sig.id}>
                  <tr className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="py-2 pr-4 font-medium">
                      <button
                        onClick={() => toggleExpand(sig.id)}
                        className="flex items-center gap-1 text-gray-200 hover:text-white"
                      >
                        {sig.emiten ?? <span className="text-gray-500">—</span>}
                        {expanded.has(sig.id) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </td>
                    <td className="py-2 pr-4"><TypeBadge type={sig.signal_type} /></td>
                    <td className="py-2 pr-4">{sig.entry_price ?? '—'}</td>
                    <td className="py-2 pr-4">{sig.stop_loss ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {sig.targets.map((t) => (
                          <button
                            key={t.id}
                            disabled={t.achieved || sig.status !== 'OPEN'}
                            onClick={() => achieveTarget(sig, t)}
                            title={t.achieved ? `Achieved ${t.achieved_by ?? ''}` : `Mark ${t.label} achieved`}
                            className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                              t.achieved
                                ? 'cursor-default bg-green-800 text-green-200'
                                : sig.status === 'OPEN'
                                ? 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                                : 'cursor-default bg-gray-800 text-gray-600'
                            }`}
                          >
                            {t.label}: {t.price}
                            {t.achieved ? ' ✓' : ' ○'}
                            {t.achieved && t.achieved_by === 'AUTO' && (
                              <span className="ml-0.5 text-[10px] opacity-70">A</span>
                            )}
                          </button>
                        ))}
                        {sig.targets.length === 0 && <span className="text-gray-600 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={sig.status} />
                      {sig.pending_sl_broadcast && (
                        <span className="ml-1 text-[10px] text-red-400">pending broadcast</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500">
                      {new Date(sig.created_at).toLocaleString()}
                    </td>
                    <td className="py-2">
                      {sig.status === 'OPEN' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => openSlModal(sig)}
                            className="rounded bg-red-800 px-2 py-1 text-xs text-red-200 hover:bg-red-700"
                          >
                            SL Hit
                          </button>
                          <button
                            onClick={() => openCutModal(sig)}
                            className="flex items-center gap-1 rounded bg-amber-800 px-2 py-1 text-xs text-amber-200 hover:bg-amber-700"
                          >
                            <Scissors size={11} /> Cut
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expanded.has(sig.id) && (
                    <tr className="border-b border-gray-800 bg-gray-900/50">
                      <td colSpan={8} className="px-4 py-2">
                        <p className="text-xs text-gray-500 mb-1">Raw message:</p>
                        <pre className="whitespace-pre-wrap text-xs text-gray-400">{sig.raw_message ?? '—'}</pre>
                        {sig.price_feed_symbol && (
                          <p className="mt-1 text-xs text-gray-600">Price symbol: {sig.price_feed_symbol}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SL Hit Modal */}
      {slModal && (
        <Modal isOpen={true} onClose={() => setSlModal(null)}>
          <h2 className="mb-4 text-lg font-bold text-white">
            Mark SL Hit — {slModal.emiten ?? `Signal #${slModal.id}`}
          </h2>

          <label className="mb-1 block text-sm text-gray-400">Broadcast message (optional)</label>
          <textarea
            value={slMessage}
            onChange={(e) => setSlMessage(e.target.value)}
            rows={4}
            className="mb-4 w-full rounded bg-gray-700 p-2 text-sm text-gray-200 focus:outline-none"
            placeholder="Leave blank to mark without broadcasting"
          />

          {modalDestinations.length > 0 && (
            <>
              <label className="mb-2 block text-sm text-gray-400">
                Send to destinations (leave unchecked for all active)
              </label>
              <div className="mb-4 space-y-1">
                {modalDestinations.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={slDestIds.includes(d.id)}
                      onChange={(e) =>
                        setSlDestIds((prev) =>
                          e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                        )
                      }
                    />
                    {d.destination_name} ({d.destination_handle})
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSlModal(null)}
              className="rounded bg-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={submitSlHit}
              disabled={slLoading}
              className="rounded bg-red-700 px-3 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50"
            >
              {slLoading ? 'Saving…' : 'Confirm SL Hit'}
            </button>
          </div>
        </Modal>
      )}

      {/* Cut Profit / Cut Loss Modal */}
      {cutModal && (
        <Modal isOpen={true} onClose={() => setCutModal(null)}>
          {(() => {
            const exitNum = cutPrice !== '' ? Number.parseFloat(cutPrice) : null
            const type = cutType(cutModal, exitNum)
            const isProfit = type === 'CUT_PROFIT'
            const isLoss = type === 'CUT_LOSS'
            return (
              <>
                <h2 className="mb-1 text-lg font-bold text-white">
                  {cutModal.emiten ?? `Signal #${cutModal.id}`}{' '}
                  <span className="text-sm font-normal text-gray-400">({cutModal.signal_type})</span>
                </h2>
                <p className="mb-4 text-xs text-gray-500">
                  Entry: {cutModal.entry_price ?? '—'} &nbsp;·&nbsp; SL: {cutModal.stop_loss ?? '—'}
                </p>

                <label className="mb-1 block text-sm text-gray-400" htmlFor="cut-exit-price">
                  Exit price
                </label>
                <input
                  id="cut-exit-price"
                  type="number"
                  step="any"
                  value={cutPrice}
                  onChange={(e) => {
                    setCutPrice(e.target.value)
                    const p = e.target.value !== '' ? Number.parseFloat(e.target.value) : null
                    const t = cutType(cutModal, p)
                    const isBuy = (cutModal.signal_type || '').toUpperCase() === 'BUY'
                    const pips = p != null && cutModal.entry_price != null
                      ? (isBuy ? p - cutModal.entry_price : cutModal.entry_price - p).toFixed(2)
                      : '—'
                    setCutMessage(
                      `✂️ ${cutLabel(cutModal, p)}\n${cutModal.emiten ?? 'Signal'} ${cutModal.signal_type ?? ''}\n` +
                      `Entry: ${cutModal.entry_price ?? '—'}  Exit: ${p ?? '—'}  (${pips} pips)`
                    )
                  }}
                  className={`mb-1 w-full rounded p-2 text-sm text-white focus:outline-none ${
                    isProfit ? 'bg-emerald-900 border border-emerald-600'
                    : isLoss ? 'bg-red-900 border border-red-600'
                    : 'bg-gray-700'
                  }`}
                  placeholder="Enter exit price"
                />
                {exitNum != null && (
                  <p className={`mb-4 text-xs font-semibold ${isProfit ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-gray-400'}`}>
                    {isProfit ? '✓ Cut Profit' : isLoss ? '✗ Cut Loss' : '—'}
                    {cutModal.entry_price != null && exitNum != null && (
                      <span className="ml-2 font-normal text-gray-400">
                        ({((cutModal.signal_type || '').toUpperCase() === 'BUY'
                          ? exitNum - cutModal.entry_price
                          : cutModal.entry_price - exitNum
                        ).toFixed(2)} pips)
                      </span>
                    )}
                  </p>
                )}

                <label className="mb-1 block text-sm text-gray-400" htmlFor="cut-message">
                  Blast message (optional)
                </label>
                <textarea
                  id="cut-message"
                  value={cutMessage}
                  onChange={(e) => setCutMessage(e.target.value)}
                  rows={4}
                  className="mb-4 w-full rounded bg-gray-700 p-2 text-sm text-gray-200 focus:outline-none"
                  placeholder="Leave blank to close without broadcasting"
                />

                {cutDestinations.length > 0 && (
                  <>
                    <p className="mb-2 text-sm text-gray-400">Send to (leave unchecked for all active)</p>
                    <div className="mb-4 space-y-1">
                      {cutDestinations.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={cutDestIds.includes(d.id)}
                            onChange={(e) =>
                              setCutDestIds((prev) =>
                                e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                              )
                            }
                          />
                          {d.destination_name} ({d.destination_handle})
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setCutModal(null)}
                    className="rounded bg-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitCut}
                    disabled={cutLoading}
                    className={`rounded px-3 py-2 text-sm text-white disabled:opacity-50 ${
                      isProfit ? 'bg-emerald-700 hover:bg-emerald-600'
                      : isLoss ? 'bg-red-700 hover:bg-red-600'
                      : 'bg-amber-700 hover:bg-amber-600'
                    }`}
                  >
                    {cutLoading ? 'Saving…' : cutLabel(cutModal, exitNum)}
                  </button>
                </div>
              </>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}
