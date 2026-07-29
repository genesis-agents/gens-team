---
name: youtube-cleanup-findings-2026-04-29
description: YouTube cleanup ceiling from server-side IP — oEmbed only, deeper checks need API v3 or residential proxy. Also: dedup lowercasing bug corrupts case-sensitive video IDs.
type: project
originSessionId: e8d21b4a-8a0e-4cac-9075-4fd968511fe2
---

## What was cleaned (2026-04-29)

Ran `backend/scripts/cleanup-youtube-broken.ts` against Railway prod DB.
8 YouTube resources deleted. Total `type=YOUTUBE_VIDEO` went 188 → 180.

All 8 deletions were the same root cause: **lowercased video IDs** like
`kotam_vvnmy`, `xdfkqbqjmdq` — IDs that should be case-sensitive (e.g.
`kOTAM_vVnMY`). YouTube returns oEmbed 400 for them; iframe shows "Video
unavailable". They cannot be recovered (original casing unknown).

## Bug: dedup service destroys case-sensitive URL components

**File:** `backend/src/modules/ai-app/explore/resources/deduplication.service.ts:78,80`

`normalizeUrl` does `.toLowerCase()` on the entire URL. When RSS ingestion
(`crawlers/rss.service.ts:582`) passes its output as the stored `sourceUrl`,
case-sensitive IDs get destroyed:

- YouTube video IDs (64-char alphabet, case-sensitive)
- Google Drive file IDs
- many other platforms

**Why:** Almost certainly written for case-insensitive dedup matching, but the
output ended up persisted as the canonical sourceUrl — that's the bug.

**Fix sketch:** lowercase only `host` (and protocol), preserve path/query case.
Don't write the lowercased URL back as sourceUrl — keep it only as a hash key.

**How to apply:** If working in the explore/resources area or fixing
ingestion bugs, treat this as known-broken. RSS crawler still corrupts new
YouTube URLs until this is patched.

## Server-side YouTube liveness checking — what works, what doesn't

Tested 2026-04-29 from local dev IP:

| Method                         | From IP-poisoned host          | Verdict                                     |
| ------------------------------ | ------------------------------ | ------------------------------------------- |
| oEmbed (`/oembed?url=...`)     | works                          | trustworthy                                 |
| Watch HTML scrape (`/watch?v`) | 429 anti-bot                   | useless                                     |
| Innertube (`youtubei.js`)      | "Sign in to confirm not a bot" | false-positive UNPLAYABLE on healthy videos |

**Bottom line:** from any non-residential IP (Railway, AWS, dev machines),
only oEmbed verdicts can be trusted. HTML/Innertube give false positives that
would mass-delete healthy videos.

oEmbed catches: 401 private, 404 deleted, 400 malformed.
oEmbed misses: region-blocked, embedding-disabled, age-restricted,
copyright takedowns where oEmbed still 200s.

**To catch the misses** you need YouTube Data API v3 (free tier 10K calls/day,
plenty for ~200 videos). Endpoint: `videos.list?part=status,contentDetails&id=...`
returns `embeddable`, `regionRestriction`, `uploadStatus`, `privacyStatus`.

**Why:** oEmbed is the only YouTube probe that resists IP rate limiting.
Anything that hits the user-facing watch page or internal YT APIs gets
fingerprinted as a bot from server IPs.

**How to apply:** When user asks "find more dead videos" or "check region/age
restrictions", explain the API v3 path; don't try to mass-detect via
HTML/Innertube — you'll mark good videos broken.
