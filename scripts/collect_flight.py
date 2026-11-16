#!/usr/bin/env python3
"""Collect a compact, auditable Metric pool history for the Flight Recorder.

No credentials are used. A complete metadata pass is required before state is
advanced. Quote probes are optional and are compared only when both samples
exist, so a temporary API failure never masquerades as a pool recovery.
"""

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.metric.xyz/public/v1/evm"
CHAIN_IDS = {"ethereum": 1, "BSC": 56, "Robinhood": 4663}
FIELDS = {
    "tier": ("Risk tier", "classificationSummary.tierQualification"),
    "admin": ("Pool admin", "admin"),
    "provider": ("Price Provider", "priceProviderAddress"),
    "providerStatus": ("Price Provider status", "priceProviderStatus"),
    "pause": ("Pause level", "pauseLevel"),
    "locked": ("Pricing lock", "lockedPricing"),
    "stopLoss": ("StopLoss configuration", "extensionDetails.stopLoss"),
    "excluded": ("Metric Pools listing", "blacklistedOnly=true response"),
    "quoteStatus": ("Quote status", "bid_ask/batch.priceProviderStatus"),
    "bidAvailable": ("Bid quote availability", "bid_ask/batch.bidAdj"),
    "askAvailable": ("Ask quote availability", "bid_ask/batch.askAdj"),
    "token0Depth": ("Token0 depth availability", "bid_ask/batch.totalToken0Available"),
    "token1Depth": ("Token1 depth availability", "bid_ask/batch.totalToken1Available"),
}
SEVERE = {"providerStatus", "pause", "quoteStatus", "bidAvailable", "askAvailable", "token0Depth", "token1Depth"}
DOC_METADATA = "https://docs.metric.xyz/reference/api/metadata"
DOC_QUOTES = "https://docs.metric.xyz/reference/api/retrieve-batch-bid-and-ask"


def utc_now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def request_json(url, payload=None):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    headers = {"Accept": "application/json", "User-Agent": "MetricAtlasFlightRecorder/1.0"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=22) as response:
                return json.load(response)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in (429, 500, 502, 503, 504):
                raise
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def pool_pass(query):
    results = []
    offset = 0
    expected = None
    for _ in range(100):
        params = {**query, "count": 500, "offset": offset, "include24h": "true"}
        url = API + "/metadata?" + urllib.parse.urlencode(params)
        page = request_json(url)
        if not isinstance(page, dict) or not isinstance(page.get("data"), list):
            raise ValueError("Invalid metadata page")
        results.extend(page["data"])
        expected = int(page.get("total", len(results)))
        nxt = page.get("nextOffset")
        if nxt is None:
            return results, expected
        if not isinstance(nxt, int) or nxt <= offset:
            raise ValueError("Invalid metadata cursor")
        offset = nxt
    raise ValueError("Metadata page limit reached")


def pool_universe(query, alternate):
    found = {}
    expected = None
    for sort in (query, alternate, query):
        rows, expected = pool_pass(sort)
        for pool in rows:
            key = pool_key(pool)
            if key:
                found[key] = pool
        if len(found) >= expected:
            return found
    raise ValueError(f"Incomplete metadata pass: {len(found)} of {expected}")


def pool_key(pool):
    address = str(pool.get("poolAddress") or "").lower()
    chain_id = CHAIN_IDS.get(pool.get("chain"))
    if not chain_id or len(address) != 42 or not address.startswith("0x"):
        return None
    return f"{chain_id}:{address}"


def normalize(pool, excluded):
    stop = (pool.get("extensionDetails") or {}).get("stopLoss")
    return {
        "pair": str(pool.get("pair") or "Unknown pair")[:100],
        "chain": pool.get("chain"),
        "address": pool.get("poolAddress"),
        "tier": (pool.get("classificationSummary") or {}).get("tierQualification") or "unknown",
        "admin": str(pool.get("admin") or "").lower(),
        "provider": str(pool.get("priceProviderAddress") or "").lower(),
        "providerStatus": str(pool.get("priceProviderStatus") or "unknown").lower(),
        "pause": pool.get("pauseLevel"),
        "locked": pool.get("lockedPricing"),
        "stopLoss": json.dumps(stop, sort_keys=True, separators=(",", ":")) if stop is not None else None,
        "excluded": excluded,
    }


def quote_states(pools):
    by_chain = {}
    for key, pool in pools.items():
        if pool.get("excluded"):
            continue
        by_chain.setdefault(pool["chain"], []).append((key, pool))
    states = {}
    failures = []
    for chain, rows in by_chain.items():
        chain_id = CHAIN_IDS.get(chain)
        if not chain_id:
            continue
        # Bound public API usage: at most 25 high-volume pools per chain.
        rows.sort(key=lambda row: float(row[1].get("_volume24h") or 0), reverse=True)
        selected = rows[:25]
        if not selected:
            continue
        try:
            result = request_json(API + f"/{chain_id}/bid_ask/batch", {"pools": [p["address"] for _, p in selected], "depth": False})
            entries = result.get("results") if isinstance(result, dict) else None
            if not isinstance(entries, list):
                raise ValueError("Invalid quote batch")
            by_address = {str(item.get("poolAddress") or "").lower(): item for item in entries if isinstance(item, dict)}
            for key, pool in selected:
                item = by_address.get(pool["address"].lower())
                quote = item.get("quote") if item else None
                if not isinstance(quote, dict):
                    continue
                bid = str(quote.get("bidAdj") or "0")
                ask = str(quote.get("askAdj") or "0")
                states[key] = {
                    "quoteStatus": str(quote.get("priceProviderStatus") or "unknown").lower(),
                    "bidAvailable": bid.isdigit() and int(bid) > 0,
                    "askAvailable": ask.isdigit() and 0 < int(ask) < 2 ** 128 - 1,
                    "token0Depth": int(quote.get("totalToken0Available") or 0) > 0,
                    "token1Depth": int(quote.get("totalToken1Available") or 0) > 0,
                }
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            failures.append({"chain": chain, "reason": type(exc).__name__})
    return states, failures


def compact(value):
    if value is None:
        return "not reported"
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)[:180]


def make_event(key, pool, field, before, after, observed_at):
    label, source_field = FIELDS[field]
    raw = f"{key}|{field}|{compact(before)}|{compact(after)}|{observed_at}"
    event_id = hashlib.sha256(raw.encode()).hexdigest()[:20]
    return {
        "id": event_id,
        "observedAt": observed_at,
        "poolKey": key,
        "pair": pool["pair"],
        "chain": pool["chain"],
        "address": pool["address"],
        "category": field,
        "title": label + " changed",
        "before": compact(before),
        "after": compact(after),
        "sourceField": source_field,
        "sourceUrl": DOC_QUOTES if field in {"quoteStatus", "bidAvailable", "askAvailable", "token0Depth", "token1Depth"} else DOC_METADATA,
        "severity": "attention" if (field in SEVERE and after in (False, "feed_down", "pool_refused")) or (field == "pause" and after not in (0, None)) else "change",
    }


def collect(previous, regular, excluded, quote_sample, quote_failures, observed_at):
    pools = {**regular, **excluded}
    current = {}
    for key, pool in pools.items():
        item = normalize(pool, key in excluded)
        item["_volume24h"] = (pool.get("analytics24h") or {}).get("volumeFiat") or 0
        current[key] = item
    events = []
    before_pools = previous.get("state", {}).get("pools", {})
    before_quotes = previous.get("state", {}).get("quotes", {})
    for key, pool in current.items():
        old = before_pools.get(key)
        if old:
            for field in ("tier", "admin", "provider", "providerStatus", "pause", "locked", "stopLoss", "excluded"):
                if old.get(field) != pool.get(field):
                    events.append(make_event(key, pool, field, old.get(field), pool.get(field), observed_at))
    for key, quote in quote_sample.items():
        old = before_quotes.get(key)
        if old and key in current:
            for field in quote:
                if old.get(field) != quote[field]:
                    events.append(make_event(key, current[key], field, old.get(field), quote[field], observed_at))
    for key, old in before_pools.items():
        if key not in current:
            events.append(make_event(key, old, "tier", old.get("tier"), "not returned in metadata", observed_at))
            events[-1]["title"] = "Pool not returned in latest complete metadata pass"
            events[-1]["severity"] = "unconfirmed"
            events[-1]["sourceField"] = "Complete metadata response"
    state_pools = {key: {k: v for k, v in pool.items() if not k.startswith("_")} for key, pool in current.items()}
    prior_events = previous.get("events", []) if isinstance(previous.get("events"), list) else []
    all_events = (events + prior_events)[:1000]
    archive = {
        "schemaVersion": 1,
        "generatedAt": observed_at,
        "cadenceMinutes": 5,
        "source": "Metric public metadata and sampled public bid/ask API",
        "coverage": {"pools": len(current), "quoteSampled": len(quote_sample), "quoteErrors": quote_failures},
        "events": all_events,
        "state": {"pools": state_pools, "quotes": quote_sample},
    }
    return archive, events


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--daily-output", type=Path)
    parser.add_argument("--regular-fixture", type=Path)
    parser.add_argument("--excluded-fixture", type=Path)
    parser.add_argument("--no-quotes", action="store_true")
    args = parser.parse_args()
    previous = json.loads(args.previous.read_text()) if args.previous and args.previous.exists() else {}
    observed_at = utc_now()
    if args.regular_fixture:
        regular_rows = json.loads(args.regular_fixture.read_text())["data"]
        excluded_rows = json.loads(args.excluded_fixture.read_text())["data"] if args.excluded_fixture else []
        regular = {pool_key(p): p for p in regular_rows if pool_key(p)}
        excluded = {pool_key(p): p for p in excluded_rows if pool_key(p)}
    else:
        regular = pool_universe({"minTvlFiat": 0, "sortBy": "volume30d"}, {"minTvlFiat": 0, "sortBy": "tvl"})
        excluded = pool_universe({"blacklistedOnly": "true"}, {"blacklistedOnly": "true", "sortBy": "volume30d"})
    pool_rows = {**regular, **excluded}
    probe_rows = {key: {**normalize(pool, key in excluded), "_volume24h": (pool.get("analytics24h") or {}).get("volumeFiat") or 0} for key, pool in pool_rows.items()}
    quotes, failures = ({}, []) if args.no_quotes else quote_states(probe_rows)
    archive, new_events = collect(previous, regular, excluded, quotes, failures, observed_at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(archive, separators=(",", ":"), ensure_ascii=False) + "\n")
    if args.daily_output:
        daily = json.loads(args.daily_output.read_text()) if args.daily_output.exists() else {"date": observed_at[:10], "events": []}
        known = {item.get("id") for item in daily.get("events", [])}
        daily["events"] = [event for event in new_events if event["id"] not in known] + daily.get("events", [])
        args.daily_output.parent.mkdir(parents=True, exist_ok=True)
        args.daily_output.write_text(json.dumps(daily, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(json.dumps({"generatedAt": observed_at, "pools": len(archive["state"]["pools"]), "quotes": len(quotes), "newEvents": len(new_events), "quoteErrors": failures}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Flight collection failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
