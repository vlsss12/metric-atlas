# Metric Atlas

**Live pool intelligence, evidence-based condition monitoring, and market design preflight for the Metric community.**

[Open the live site](https://metric-atlas-xyz.vercel.app/) · [Read the community guide](COMMUNITY_GUIDE.md) · [Download the team brief (PDF)](docs/Metric-Atlas-Team-Brief.pdf) · [View the community post on X](https://x.com/vlsss12/status/2121527705283826013)

Metric Atlas is an independent, read-only community project. It brings five workflows into one interface:

| Workflow | What it does |
| --- | --- |
| **Overview** | Explores all pools returned by Metric's paginated public metadata API, including the separate excluded-pool list. Shows reported TVL, 24-hour volume and swaps, pool status, and detailed metadata. |
| **Sentinel** | Watches selected pools in the browser and records differences between successful refresh snapshots, including tier, admin, price provider, safeguards, pause state, and fee shares. |
| **Mission Control** | Tracks reported provider issues, paused pools, and removals returned by Metric's separate excluded-pool query. Each observation includes evidence, timestamps, a next step, and a local acknowledgement control. |
| **Flight Recorder** | Shows live metadata changes from successful one-minute checks while the tab is open, alongside a separate public archive from a background collector. Search the timeline, inspect evidence, and export a JSON record. |
| **Market OS** | Checks a proposed pool configuration against six documented baseline conditions plus Metric’s new price-reference policy, and illustrates a stale-quote price-shock scenario. |

## What you can do

- **Explore the full indexed pool set.** Search by pair, token, address, curator, or admin; filter by chain and risk tier; sort by newest, oldest, TVL, 24-hour volume, or historical 7-day markout APR. The table paginates through 25 pools per page.
- **Inspect a pool.** Open details for addresses, creation time, reported volume, pricing and StopLoss settings, provider status, fee shares, and the full public API record.
- **Distinguish excluded pools.** A pool returned by Metric's separate `blacklistedOnly` query is labeled **Removed from Metric Pools**. This refers to the public listing, not deletion of its onchain contract.
- **Monitor selected pools.** Add a watch from Overview or paste a pool address in Sentinel. Compare current metadata with the last successfully collected snapshot and review the local change log.
- **Investigate pool conditions.** Mission Control derives signals from successful full-universe API refreshes, supports search and filters, and records when a reported condition is later resolved. A pool absent from a later response remains unconfirmed rather than being marked resolved.
- **Reconstruct observed changes.** Flight Recorder compares live metadata checks every minute while the tab is open. A separate collector records background metadata and bounded quote samples in a public archive. Search by pool, filter by category, select a UTC archive date, and export an evidence record. Separate timestamps identify the live check and archive collection.
- **Refresh live data.** The open page requests fresh API data every 60 seconds, refreshes a stale tab when it becomes visible, and offers a manual refresh button. The header status reflects loading, success, or an error.
- **Assess a market design.** Enter a pair, chain, pricing model, liquidity, half-spread, quote staleness, bin width, StopLoss drawdown, and price shock. Market OS reports seven preflight checks, including the new price-reference restriction, and an illustrative stale-quote exposure.
- **Get guided help.** An animated robot opens a topic-based guide for the site's features. Its orbiting indicators cycle through live pool count, reported TVL, and 24-hour volume. Motion respects reduced-motion preferences.

## Important boundaries

- The site reads Metric's **public API** directly. It does not connect a wallet, request an API key, execute trades, create pools, or move funds.
- Sentinel watch lists, snapshots, and Mission Control observations are stored in **your browser**. Their monitoring stops when the page is closed, and acknowledgements are local. Flight Recorder uses a separate, public, scheduled archive.
- Flight Recorder's live metadata check runs every 60 seconds while the page is open. Its live observations are tab-local and disappear when that tab closes. The public archive targets a five-minute GitHub Actions schedule; scheduled runs can be delayed, skipped, or fail. The page displays the separate last successful collection time and status. Quote sampling covers selected high-volume pools, not every pool. Its first pass establishes a baseline; it does not reconstruct changes before that pass.
- A metadata or quote change is an observation, not proof of cause or onchain execution. A pool absent from a complete pass is marked unconfirmed. No quote guarantees a swap will execute.
- Mission Control reads reported metadata fields; it does not directly measure price-feed freshness, provide 24/7 alerting, or notify curators. An API failure preserves the previous observation and is shown as a failed check.
- A watched address missing from both API lists is shown as **unconfirmed** rather than assumed removed.
- Aggregate cards sum available values returned by the API. They are not independently audited protocol totals. Some pool metrics may be unavailable.
- Markout is historical and is not a prediction of LP returns. A risk tier describes reported safeguards and permissions, not profitability.
- A Market OS score is a planning aid, not an official Metric tier assignment. Its price-shock dollar figure assumes 50% of entered liquidity fills at a stale quote; it is not an execution simulation or loss forecast.

## Run locally

No build step or secrets are required. From the repository root:

```sh
python3 -m http.server 8765
```

Open [http://localhost:8765](http://localhost:8765). A network connection is needed to load Metric's public API. The project is plain HTML, CSS, and JavaScript and can be hosted as a static site.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Accessible interface and five main views |
| `styles.css` | Responsive dark and gold design, glass panels, motion, and reduced-motion support |
| `flight.css` | Flight Recorder timeline and evidence panel design |
| `app.js` | API pagination, rendering, watch snapshots, and Market OS checks |
| `mission.js` | Evidence-based pool condition detection, reconciliation, and local history |
| `flight.js` | Archive freshness, timeline filters, evidence detail, and JSON export |
| `scripts/collect_flight.py` | Complete metadata pass, bounded quote sampling, and event archive generation |
| `.github/workflows/flight-recorder.yml` | Best-effort scheduled collection and publication to `flight-data` |
| `guide.js` | Topic-based product guide |
| `mascot.js` | Animated guide and live stat interactions |
| `mascot-*.webp` | Original guide character assets |
| [`COMMUNITY_GUIDE.md`](COMMUNITY_GUIDE.md) | Step-by-step guide for visitors and contributors |
| [`docs/Metric-Atlas-Team-Brief.pdf`](docs/Metric-Atlas-Team-Brief.pdf) | Visual brief for the Metric team |

## Sources and attribution

- [Metric public API](https://docs.metric.xyz/reference/api)
- [Metric metadata endpoint](https://docs.metric.xyz/reference/api/metadata)
- [Metric batch bid/ask endpoint](https://docs.metric.xyz/reference/api/retrieve-batch-bid-and-ask)
- [GitHub Actions scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Metric pool tiers](https://docs.metric.xyz/use-metric/pool-tiers)
- [Risks and safeguards](https://docs.metric.xyz/use-metric/risks-and-safeguards)
- [Understanding LP returns](https://docs.metric.xyz/use-metric/provide-and-manage-liquidity/understanding-your-returns)
- [Running a pool](https://docs.metric.xyz/run-a-pool/getting-started)

Metric Atlas is not affiliated with or endorsed by Metric. Metric names, data, and links belong to their respective owners.

## Pool price-reference policy (effective 26 November 2026)

Metric announced that, starting 26 November 2026 at 17:00 (time zone unspecified in the announcement), pool operators must not reference other Metric pools or other operators’ custom price feeds. Standard public oracles such as Pyth and Chainlink are unaffected. Metric says non-compliant pools will be delisted from its API and routing, while withdrawals remain possible. Market OS now asks for the proposed reference source and flags the two prohibited dependencies. This is a self-reported planning check, not verification of an actual feed graph. A pool absent from both API responses remains unconfirmed; Atlas never attributes the cause to this policy without direct evidence.
