# Community guide

This guide explains how to use Metric Atlas and what each result means. Start with the [live site](https://metric-atlas-xyz.vercel.app/). No wallet connection or account is required.

## 1. Explore pools in Overview

Open **Overview** to see the indexed pool count and sums of available reported USD TVL, 24-hour volume, and swaps. These figures update after a successful API request; they are not independently audited totals.

The **All indexed pools** table loads every page returned by the public metadata endpoint and the separate excluded-pool list. Each row shows pair, chain, creation date, TVL, 24-hour volume, historical 7-day markout APR (when available), and status.

To find a pool:

1. Search by pair, token symbol, pool address, curator name, or admin address.
2. Filter by Ethereum, BNB Chain, or Robinhood Chain and by reported risk tier.
3. Sort by creation date, TVL, 24-hour volume, or 7-day markout APR.
4. Use **Next** and **Previous** to move through the 25-pool pages.
5. Select **Details** for metadata and the full API record, or **Watch** to send the pool to Sentinel.

**Removed from Metric Pools** means the pool appears in Metric's separate excluded-pool response. It means removal from the public pool listing; it does **not** imply the smart contract was deleted. If a pool is absent from both API responses, its listing status is unconfirmed.

Metric's green, yellow, and red tiers describe safeguard configuration and permissions. They do not guarantee safety or returns. Historical markout does not include every factor affecting an LP position; review [Metric's returns guide](https://docs.metric.xyz/use-metric/provide-and-manage-liquidity/understanding-your-returns).

## 2. Monitor a pool in Sentinel

Open **Sentinel**, then paste a valid `0x` pool address and choose a chain, or select **Watch** from Overview. A watch card displays the latest reported metrics and key controls.

Sentinel compares snapshots after successful refreshes. Its **Observed changes** log can show changes in:

- Risk tier and listing state
- Pool admin and Price Provider address or status
- Pricing lock and pause state
- StopLoss configuration
- Curator and protocol spread shares and notional fee

The history starts when you add a watch. It is stored locally in the current browser and can be cleared. It does not run in the background after the tab closes, sync to another device, or independently inspect the chain. Confirm important changes through Metric and the relevant block explorer before acting.

## 3. Investigate conditions in Mission Control

Open **Mission Control** for an evidence feed across pools returned by a complete Metric API refresh. It currently identifies three reported conditions: a non-healthy Price Provider status, a positive `pauseLevel`, and a pool in Metric's separate excluded-pool list. The cards show the pool, chain, first and last observation time, source field, raw value, and a suggested verification step.

Search by pair or address and filter active, resolved, provider, pause, or removed observations. **Acknowledge locally** changes the card only in your browser; it does not notify Metric or a curator. A condition is marked resolved only when that pool returns in a later successful refresh without that condition. If the pool disappears from the response, its status stays unconfirmed.

The feed is active while this page is open. It is not a 24/7 alert service, does not independently test an oracle or price-feed freshness, and does not claim that an unknown provider status is healthy. For a consequential decision, confirm the latest state with Metric and onchain.

## 4. Test an idea in Market OS

Open **Market OS** and enter a proposed pair, chain, pricing model, initial liquidity, target half-spread, quote staleness, bin width, StopLoss drawdown, and price shock. Set whether Price Provider and StopLoss are immutable and whether a withdrawal extension is enabled. Then select **Run preflight**.

The report evaluates six conditions derived from Metric's published public-pool guidance: a typical aggregator liquidity threshold, immutable Price Provider and StopLoss settings, bin width of at most 1%, StopLoss drawdown of at most 15%, no withdrawal extension, and anchored pricing with quote freshness of at most 15 seconds. See [pool tier rules](https://docs.metric.xyz/use-metric/pool-tiers) and [operator setup](https://docs.metric.xyz/run-a-pool/getting-started) for the full requirements.

A **6/6** result means this simplified baseline passed. It does not assign an official tier. Curator verification, feed mapping, initialized safeguards, and live execution still need separate review.

The **stale-quote exposure** card is an illustration: it uses the entered adverse price jump minus half-spread and assumes 50% of entered initial liquidity fills at a stale quote. It is not an exact Metric swap simulation, a prediction of loss, or financial advice.

## 5. Use the robot guide

Select the robot in the hero to open the built-in help panel. Choose a topic to see what a feature does, how to use it, and its limits. The moving orbit indicators cycle through live indexed pool count, reported TVL, and 24-hour volume. Visitors who prefer reduced motion get a calmer experience.

## 6. Understand live data

While the page is open, Metric Atlas requests fresh public metadata **every 60 seconds**. Returning to a stale tab triggers another request; **Refresh now** requests one immediately. New pools appear once Metric's public API includes them and a successful refresh completes. The LIVE indicator reflects the last successful update; an API failure is shown visibly.

No wallet, API key, or personal account is required. The site is read-only, and Sentinel and Mission Control observations remain in your browser's local storage.

## 7. Share feedback or contribute

The most useful feedback includes the page or feature, a pool address and chain when relevant, what you expected, what you observed, and a screenshot. Avoid sharing wallet secrets or private keys. You can open a GitHub issue or share feedback in Metric's Discord **builders-chat** channel. This is an independent community project, not an official Metric support channel.

For a visual introduction, [download the team brief](docs/Metric-Atlas-Team-Brief.pdf). The [community post on X](https://x.com/vlsss12/status/2121527705283826013) provides a short public overview.
