# Saturday 21 November 2026 — 36 dated stories, 7 regions, 13 drawn panels

[![Competition](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121)
[![Rank](https://make.fun/badge/news-image-20261121/ferdizi/news-image-20261121-v5-entry/rank.svg)](https://make.fun/bounty/news-image-20261121)
[![Reward](https://make.fun/badge/news-image-20261121/ferdizi/news-image-20261121-v5-entry/reward.svg)](https://make.fun/bounty/news-image-20261121)

A one-day world news front page for [make.fun's news-image-20261121 bounty](https://make.fun/bounty/news-image-20261121):
**Saturday 21 November 2026** — COP31 runs into overtime, Houthi missiles aimed at Riyadh
are shot down, and a magnitude 6.7 quake shakes central Peru, plus 33 more dated stories
across 7 regions, a UTC timeline, a stat strip, a numbered world map, and a DATE CHECK box
that names the older news left out on purpose.

## How it works

`main.ts` draws the whole 1024×1024 PNG in code — Node 22 stdlib only, no network,
no `Date`, no randomness, no binary assets. Every letter is a light single-stroke
vector glyph (a classical serif for the masthead, clean sans for the rest); every
picture (globe + calendar, Riyadh skyline, seismograph, world map, panel icons) is
drawn from shapes. Two runs produce byte-identical output.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, ≤ 1 MiB, deterministic).

## Contents

- `main.ts` — the program that draws the front page
- `README.md` — this file
- `LICENSE` — MIT
- `.makefun/owner.json` — payout wallet
