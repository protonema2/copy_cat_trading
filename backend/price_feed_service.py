import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional


TWELVEDATA_BASE = "https://api.twelvedata.com"
_MAX_RETRIES = 2
_RETRY_DELAY = 5  # seconds between retries


def get_ohlc_range(symbols: list[str], interval_seconds: int) -> dict[str, tuple[float, float]]:
    """Return the (high, low) price range seen across all 1-min candles that fit within
    the last *interval_seconds* for each symbol.

    This is the correct way to detect TP/SL hits between polls — using the candle high/low
    rather than a single snapshot price avoids missing intra-interval breaches.

    Returns a mapping of symbol -> (high, low). Symbols that could not be resolved are omitted.
    Falls back to get_prices() snapshot if the time_series call fails.
    """
    if not symbols:
        return {}

    # How many 1-min candles cover the interval (round up, add 1 for safety)
    outputsize = math.ceil(interval_seconds / 60) + 1

    api_key = os.getenv("TWELVEDATA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("TWELVEDATA_API_KEY is not configured")

    symbol_param = ",".join(symbols)
    url = (
        f"{TWELVEDATA_BASE}/time_series"
        f"?symbol={urllib.parse.quote(symbol_param)}"
        f"&interval=1min"
        f"&outputsize={outputsize}"
        f"&apikey={api_key}"
    )

    last_exc: Optional[Exception] = None
    for attempt in range(_MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as response:
                body = response.read().decode("utf-8")
            data = json.loads(body)
            return _parse_ohlc_response(data, symbols)
        except Exception as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)

    raise RuntimeError(f"TwelveData OHLC fetch failed after {_MAX_RETRIES} attempts: {last_exc}") from last_exc


def _candle_high_low(candle: dict) -> Optional[tuple[float, float]]:
    try:
        return float(candle["high"]), float(candle["low"])
    except (KeyError, TypeError, ValueError):
        return None


def _extract_high_low(values: list) -> Optional[tuple[float, float]]:
    pairs = [_candle_high_low(c) for c in values]
    valid = [p for p in pairs if p is not None]
    if not valid:
        return None
    highs, lows = zip(*valid)
    return max(highs), min(lows)


def _values_for_symbol(data: dict, symbol: str, single: bool) -> Optional[list]:
    if single:
        values = data.get("values")
        return values if isinstance(values, list) else None
    entry = data.get(symbol)
    if not isinstance(entry, dict):
        return None
    values = entry.get("values")
    return values if isinstance(values, list) else None


def _parse_ohlc_response(data: dict, requested_symbols: list[str]) -> dict[str, tuple[float, float]]:
    single = len(requested_symbols) == 1
    result: dict[str, tuple[float, float]] = {}
    for symbol in requested_symbols:
        values = _values_for_symbol(data, symbol, single)
        if values is None:
            continue
        hl = _extract_high_low(values)
        if hl:
            result[symbol] = hl
    return result


def get_prices(symbols: list[str]) -> dict[str, float]:
    """Fetch current prices for the given symbols in a single batched API call.

    Returns a mapping of symbol -> float price. Symbols that could not be
    resolved are omitted from the result. Raises RuntimeError if the API key
    is missing or if all retry attempts fail.
    """
    api_key = os.getenv("TWELVEDATA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("TWELVEDATA_API_KEY is not configured")

    if not symbols:
        return {}

    symbol_param = ",".join(symbols)
    url = f"{TWELVEDATA_BASE}/price?symbol={urllib.parse.quote(symbol_param)}&apikey={api_key}"

    last_exc: Optional[Exception] = None
    for attempt in range(_MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as response:
                body = response.read().decode("utf-8")
            data = json.loads(body)
            return _parse_price_response(data, symbols)
        except Exception as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)

    raise RuntimeError(f"TwelveData price fetch failed after {_MAX_RETRIES} attempts: {last_exc}") from last_exc


def _parse_price_response(data: dict, requested_symbols: list[str]) -> dict[str, float]:
    result: dict[str, float] = {}

    if len(requested_symbols) == 1:
        # Single-symbol response: {"price": "1234.56"} or {"code": 400, ...}
        if "price" in data:
            try:
                result[requested_symbols[0]] = float(data["price"])
            except (ValueError, TypeError):
                pass
        return result

    # Multi-symbol response: {"XAU/USD": {"price": "1234.56"}, "EUR/USD": {...}}
    for symbol in requested_symbols:
        entry = data.get(symbol)
        if not isinstance(entry, dict):
            continue
        price_str = entry.get("price")
        if price_str is None:
            continue
        try:
            result[symbol] = float(price_str)
        except (ValueError, TypeError):
            pass

    return result
