"""Unit tests for _signal_pips() in channel_stats_service.

One signal = one full position. Pip convention: 1 pip = $1.00 price movement (Gold scale).
Positive = profit, negative = loss.
"""

from types import SimpleNamespace

from ..channel_stats_service import _signal_pips


def _target(price, achieved=True):
    return SimpleNamespace(price=price, achieved=achieved)


def _signal(signal_type, entry, stop_loss=None, exit_price=None, status="OPEN", targets=None):
    return SimpleNamespace(
        signal_type=signal_type,
        entry_price=entry,
        stop_loss=stop_loss,
        exit_price=exit_price,
        status=status,
        targets=targets or [],
    )


# ── SL_HIT ────────────────────────────────────────────────────────────────────

def test_buy_sl_hit_uses_stop_loss():
    sig = _signal("BUY", entry=4040, stop_loss=4030, status="SL_HIT")
    assert _signal_pips(sig) == -10.0


def test_sell_sl_hit_uses_stop_loss():
    sig = _signal("SELL", entry=4040, stop_loss=4050, status="SL_HIT")
    assert _signal_pips(sig) == -10.0


def test_sl_hit_prefers_exit_price_over_stop_loss():
    # actual fill differs from configured SL level
    sig = _signal("BUY", entry=4040, stop_loss=4030, exit_price=4028, status="SL_HIT")
    assert _signal_pips(sig) == -12.0


def test_sl_hit_no_stop_loss_no_exit_returns_zero():
    sig = _signal("BUY", entry=4040, status="SL_HIT")
    assert _signal_pips(sig) == 0.0


# ── CLOSED (Cut Profit / Cut Loss) ────────────────────────────────────────────

def test_buy_cut_profit():
    # XAUUSD BUY entry 4040, cut at 4049.07479 → 9.07479 pips
    sig = _signal("BUY", entry=4040, exit_price=4049.07479, status="CLOSED")
    assert abs(_signal_pips(sig) - 9.07479) < 1e-6


def test_buy_cut_loss():
    sig = _signal("BUY", entry=4040, exit_price=4035, status="CLOSED")
    assert _signal_pips(sig) == -5.0


def test_sell_cut_profit():
    sig = _signal("SELL", entry=4040, exit_price=4030, status="CLOSED")
    assert _signal_pips(sig) == 10.0


def test_sell_cut_loss():
    sig = _signal("SELL", entry=4040, exit_price=4045, status="CLOSED")
    assert _signal_pips(sig) == -5.0


def test_closed_ignores_achieved_targets_no_double_count():
    # Signal has 2 achieved targets AND an exit_price — must NOT add both
    sig = _signal(
        "BUY", entry=4040, exit_price=4049.07479, status="CLOSED",
        targets=[_target(4043), _target(4046)],
    )
    # Should be exactly exit-based pips, not 3 + 6 + 9.07479
    assert abs(_signal_pips(sig) - 9.07479) < 1e-6


def test_closed_without_exit_price_falls_through_to_targets():
    # edge case: CLOSED status but exit_price somehow not set
    sig = _signal("BUY", entry=4040, status="CLOSED", targets=[_target(4043)])
    assert _signal_pips(sig) == 3.0


# ── TP_HIT ────────────────────────────────────────────────────────────────────

def test_buy_tp_hit_two_targets():
    sig = _signal(
        "BUY", entry=4040, status="TP_HIT",
        targets=[_target(4043), _target(4046)],
    )
    assert _signal_pips(sig) == 9.0  # 3 + 6


def test_sell_tp_hit_two_targets():
    sig = _signal(
        "SELL", entry=4050, status="TP_HIT",
        targets=[_target(4047), _target(4044)],
    )
    assert _signal_pips(sig) == 9.0  # 3 + 6


def test_tp_hit_unachieved_targets_not_counted():
    sig = _signal(
        "BUY", entry=4040, status="TP_HIT",
        targets=[_target(4043, achieved=True), _target(4046, achieved=False)],
    )
    assert _signal_pips(sig) == 3.0


# ── OPEN ──────────────────────────────────────────────────────────────────────

def test_open_partial_targets():
    sig = _signal(
        "BUY", entry=4040, status="OPEN",
        targets=[_target(4043, achieved=True), _target(4046, achieved=False)],
    )
    assert _signal_pips(sig) == 3.0


def test_open_no_achieved_targets():
    sig = _signal("BUY", entry=4040, status="OPEN", targets=[_target(4043, achieved=False)])
    assert _signal_pips(sig) == 0.0


# ── Edge cases ─────────────────────────────────────────────────────────────────

def test_no_entry_price_returns_zero():
    sig = _signal("BUY", entry=None, stop_loss=4030, status="SL_HIT")
    assert _signal_pips(sig) == 0.0


def test_target_with_none_price_skipped():
    sig = _signal("BUY", entry=4040, status="TP_HIT",
                  targets=[SimpleNamespace(price=None, achieved=True)])
    assert _signal_pips(sig) == 0.0
