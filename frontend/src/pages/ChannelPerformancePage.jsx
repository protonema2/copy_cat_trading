import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { channelStatsApi } from '../api'

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(val) {
  if (val == null) return '—'
  return `${(val * 100).toFixed(1)}%`
}

function num(val, decimals = 1) {
  if (val == null) return '—'
  return val.toFixed(decimals)
}

function apiErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || String(item)).join(', ')
  }
  return fallback
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <p className="mb-1 text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

// ── Detail view ───────────────────────────────────────────────────────────────

function ChannelDetail({ channelId }) {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (fromDate) params.from = fromDate
      if (toDate) params.to = toDate
      const res = await channelStatsApi.get(channelId, params)
      setStats(res.data)
    } catch (e) {
      setError(apiErrorMessage(e, 'Failed to load stats'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [channelId])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/performance')}
          className="rounded bg-gray-700 p-1.5 text-gray-300 hover:bg-gray-600"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl font-bold text-white">
          {stats ? stats.channel_name : 'Channel Performance'}
        </h1>
      </div>

      {/* Date range filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded bg-gray-700 px-2 py-1.5 text-sm text-gray-200 focus:outline-none"
        />
        <span className="self-center text-gray-500 text-sm">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded bg-gray-700 px-2 py-1.5 text-sm text-gray-200 focus:outline-none"
        />
        <button onClick={load} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600">
          Apply
        </button>
        <button
          onClick={() => { setFromDate(''); setToDate(''); setTimeout(load, 0) }}
          className="rounded bg-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-500"
        >
          Clear
        </button>
        <Link
          to={`/signals?channel_id=${channelId}`}
          className="ml-auto rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600"
        >
          View signals →
        </Link>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : stats ? (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Signals" value={stats.total_signals} />
            <StatCard
              label="Win Rate"
              value={pct(stats.win_rate)}
              sub={`${stats.tp_hit_count} TP / ${stats.tp_hit_count + stats.sl_hit_count} resolved`}
              accent={stats.win_rate != null && stats.win_rate >= 0.5 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="SL Hit Rate"
              value={pct(stats.sl_hit_rate)}
              accent={stats.sl_hit_rate != null && stats.sl_hit_rate > 0.5 ? 'text-red-400' : 'text-gray-200'}
            />
            <StatCard label="Avg Time to Resolution" value={stats.avg_time_to_resolution_hours != null ? `${num(stats.avg_time_to_resolution_hours)}h` : '—'} />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Open" value={stats.open_count} accent="text-blue-300" />
            <StatCard label="TP Hit" value={stats.tp_hit_count} accent="text-green-300" />
            <StatCard label="SL Hit" value={stats.sl_hit_count} accent="text-red-300" />
            <StatCard label="Closed" value={stats.closed_count} accent="text-gray-400" />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Total Pips"
              value={stats.total_pips != null ? num(stats.total_pips, 2) : '—'}
              sub="from achieved TPs + cut signals"
              accent={stats.total_pips != null && stats.total_pips >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <StatCard label="Avg Targets Achieved" value={stats.avg_targets_achieved != null ? num(stats.avg_targets_achieved, 2) : '—'} />
            <StatCard label="BUY Win Rate" value={pct(stats.buy_win_rate)} accent="text-emerald-400" />
            <StatCard label="SELL Win Rate" value={pct(stats.sell_win_rate)} accent="text-rose-400" />
          </div>

          {/* BUY vs SELL breakdown */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="mb-2 text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <TrendingUp size={12} /> BUY signals
              </p>
              <p className="text-xl font-bold text-emerald-400">{pct(stats.buy_win_rate)}</p>
              <p className="text-xs text-gray-500">win rate</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="mb-2 text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <TrendingDown size={12} /> SELL signals
              </p>
              <p className="text-xl font-bold text-rose-400">{pct(stats.sell_win_rate)}</p>
              <p className="text-xs text-gray-500">win rate</p>
            </div>
          </div>

          {/* Volume chart */}
          {stats.daily_counts && stats.daily_counts.length > 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="mb-4 text-sm font-semibold text-gray-300 flex items-center gap-1.5">
                <Activity size={14} /> Signal Volume
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.daily_counts} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}
                    labelStyle={{ color: '#d1d5db' }}
                    itemStyle={{ color: '#60a5fa' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

// ── Overview table ────────────────────────────────────────────────────────────

const SORT_KEYS = ['total_signals', 'win_rate', 'sl_hit_rate', 'open_count', 'avg_time_to_resolution_hours']

function OverviewTable() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('total_signals')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await channelStatsApi.all()
        setRows(res.data)
      } catch (e) {
        setError(apiErrorMessage(e, 'Failed to load'))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity
    const bv = b[sortKey] ?? -Infinity
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const SortTh = ({ label, k }) => (
    <th
      onClick={() => toggleSort(k)}
      className="cursor-pointer select-none pb-2 pr-4 text-left text-xs text-gray-500 hover:text-gray-300"
    >
      {label}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold text-white">Channel Performance</h1>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-gray-500">No channels with signals yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-300">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="pb-2 pr-4 text-left text-xs text-gray-500">Channel</th>
                <SortTh label="Signals" k="total_signals" />
                <SortTh label="Win Rate" k="win_rate" />
                <SortTh label="SL Rate" k="sl_hit_rate" />
                <th className="pb-2 pr-4 text-left text-xs text-gray-500">Open</th>
                <SortTh label="Avg Resolution" k="avg_time_to_resolution_hours" />
                <th className="pb-2 text-left text-xs text-gray-500" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.channel_id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-2 pr-4 font-medium text-gray-200">{r.channel_name}</td>
                  <td className="py-2 pr-4">{r.total_signals}</td>
                  <td className={`py-2 pr-4 font-semibold ${
                    r.win_rate == null ? 'text-gray-500' : r.win_rate >= 0.5 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {pct(r.win_rate)}
                  </td>
                  <td className={`py-2 pr-4 ${r.sl_hit_rate != null && r.sl_hit_rate > 0.5 ? 'text-red-400' : 'text-gray-300'}`}>
                    {pct(r.sl_hit_rate)}
                  </td>
                  <td className="py-2 pr-4 text-blue-400">{r.open_count}</td>
                  <td className="py-2 pr-4 text-gray-400">
                    {r.avg_time_to_resolution_hours != null ? `${num(r.avg_time_to_resolution_hours)}h` : '—'}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => navigate(`/performance/${r.channel_id}`)}
                      className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                    >
                      Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page router ───────────────────────────────────────────────────────────────

export default function ChannelPerformancePage() {
  const { channelId } = useParams()
  return channelId ? <ChannelDetail channelId={Number(channelId)} /> : <OverviewTable />
}
