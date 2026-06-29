"""Pure aggregation functions for channel performance stats.

No route logic, no writes — read-only queries on Signal + SignalTarget.
Same philosophy as message_rules.py: framework-free and unit-testable.
"""

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Channel, Signal, SignalTarget


def _pips(price_diff: float, is_buy: bool) -> float:
    return price_diff if is_buy else -price_diff


def _target_pips(signal, is_buy: bool) -> float:
    return sum(
        _pips(t.price - signal.entry_price, is_buy)
        for t in signal.targets
        if t.achieved and t.price is not None
    )


def _signal_pips(signal) -> float:
    """Return the net pips for a single signal.

    Pip convention: 1 pip = $1.00 price movement (Gold/XAUUSD scale, no multiplier).
    Positive = profit, negative = loss.

    Branches are mutually exclusive — one signal is one full position closed once:
    - CLOSED with exit_price: authoritative manual exit (Cut Profit / Cut Loss).
      Use entry→exit_price only; achieved targets are intermediate markers, not partials.
    - SL_HIT: use exit_price if the fill was recorded, otherwise fall back to stop_loss.
      Result is typically negative (loss).
    - TP_HIT / OPEN: sum pips across each achieved target price level.
    """
    if signal.entry_price is None:
        return 0.0
    is_buy = (signal.signal_type or "").upper() == "BUY"

    if signal.status == "CLOSED" and signal.exit_price is not None:
        return _pips(signal.exit_price - signal.entry_price, is_buy)

    if signal.status == "SL_HIT":
        sl_price = signal.exit_price if signal.exit_price is not None else signal.stop_loss
        return _pips(sl_price - signal.entry_price, is_buy) if sl_price is not None else 0.0

    return _target_pips(signal, is_buy)


def _avg_resolution_hours(resolved_signals: list) -> Optional[float]:
    deltas = [
        (s.updated_at - s.created_at).total_seconds() / 3600
        for s in resolved_signals
        if s.created_at and s.updated_at and s.updated_at > s.created_at
    ]
    return sum(deltas) / len(deltas) if deltas else None


def _win_rate(group: list) -> Optional[float]:
    resolved = sum(1 for s in group if s.status in ("TP_HIT", "SL_HIT", "CLOSED"))
    wins = sum(1 for s in group if s.status == "TP_HIT")
    return wins / resolved if resolved > 0 else None


def compute_channel_stats(
    db: Session,
    channel_id: int,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
) -> dict:
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        return {}

    q = db.query(Signal).filter(Signal.channel_id == channel_id)
    if from_dt:
        q = q.filter(Signal.created_at >= from_dt)
    if to_dt:
        q = q.filter(Signal.created_at <= to_dt)

    signals = q.order_by(Signal.created_at).all()

    total = len(signals)
    open_count = sum(1 for s in signals if s.status == "OPEN")
    tp_hit = sum(1 for s in signals if s.status == "TP_HIT")
    sl_hit = sum(1 for s in signals if s.status == "SL_HIT")
    closed = sum(1 for s in signals if s.status == "CLOSED")

    resolved = tp_hit + sl_hit + closed
    win_rate = tp_hit / resolved if resolved > 0 else None
    sl_hit_rate = sl_hit / resolved if resolved > 0 else None

    # Per-type win rates and total pips
    buy_signals = [s for s in signals if (s.signal_type or "").upper() == "BUY"]
    sell_signals = [s for s in signals if (s.signal_type or "").upper() == "SELL"]
    buy_win_rate = _win_rate(buy_signals)
    sell_win_rate = _win_rate(sell_signals)
    total_pips = sum(_signal_pips(s) for s in signals)

    # Avg targets achieved per signal (only signals that have targets)
    signals_with_targets = [s for s in signals if s.targets]
    avg_targets_achieved: Optional[float] = None
    if signals_with_targets:
        total_achieved = sum(sum(1 for t in s.targets if t.achieved) for s in signals_with_targets)
        avg_targets_achieved = total_achieved / len(signals_with_targets)

    # Avg time to resolution (hours) — only resolved signals
    resolved_signals = [s for s in signals if s.status in ("TP_HIT", "SL_HIT", "CLOSED")]
    avg_resolution_hours = _avg_resolution_hours(resolved_signals)

    # Signals per day over the queried window
    signals_per_day: Optional[float] = None
    if signals:
        earliest = signals[0].created_at
        latest = signals[-1].created_at
        effective_from = from_dt or earliest
        effective_to = to_dt or latest
        span_days = max(1, (effective_to - effective_from).total_seconds() / 86400)
        signals_per_day = total / span_days

    # Daily counts for the volume chart
    daily_counts = _build_daily_counts(signals, from_dt, to_dt)

    return {
        "channel_id": channel_id,
        "channel_name": channel.name,
        "total_signals": total,
        "open_count": open_count,
        "tp_hit_count": tp_hit,
        "sl_hit_count": sl_hit,
        "closed_count": closed,
        "win_rate": win_rate,
        "sl_hit_rate": sl_hit_rate,
        "avg_targets_achieved": avg_targets_achieved,
        "buy_win_rate": buy_win_rate,
        "sell_win_rate": sell_win_rate,
        "avg_time_to_resolution_hours": avg_resolution_hours,
        "signals_per_day": signals_per_day,
        "total_pips": round(total_pips, 2),
        "daily_counts": daily_counts,
    }


def _build_daily_counts(signals: list, from_dt: Optional[datetime], to_dt: Optional[datetime]) -> list[dict]:
    if not signals:
        return []

    bucket: dict[str, int] = {}
    for s in signals:
        day = s.created_at.strftime("%Y-%m-%d") if s.created_at else "unknown"
        bucket[day] = bucket.get(day, 0) + 1

    return [{"date": day, "count": count} for day, count in sorted(bucket.items())]


def compute_all_channels_stats(
    db: Session,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
) -> list[dict]:
    channels = db.query(Channel).all()
    results = []
    for channel in channels:
        stats = compute_channel_stats(db, channel.id, from_dt, to_dt)
        if stats:
            # Omit the heavy daily_counts array from the summary table
            stats.pop("daily_counts", None)
            stats["daily_counts"] = []
            results.append(stats)
    return results
