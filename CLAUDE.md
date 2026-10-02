# order_visualizer

A read-only web app that shows the order engine of `unified_broker_interface` (UBI, at `/home/pramod/Projects/unified_broker_interface`) working its orders in 3D: each plan's tree of parts, each broker order (leg) as it rests, fills or is cancelled, and time as depth.

The project started from the handoff doc https://claude.ai/code/artifact/abfb73c0-09a9-4d1a-a5e3-90c46836ddaf on 2026-10-02.

## Commands

```bash
.venv/bin/pytest                      # back-end tests
.venv/bin/ruff check .                # lint
bin/order-visualizer                  # run the server on :8105 (reads .env)
bin/set-password                      # print a password hash and session secret for .env
bin/create-reader-role                # create the read-only database role once, and write its password into .env
bin/grant-ticks-read                  # let that role read unified.ticks, for the order book panel
cd frontend && npm run build          # build the React app into frontend/dist (npm is under ~/.nvm/versions/node/v24.21.0/bin)
cd frontend && npm run dev            # Vite dev server on :5176, proxying /api to :8105
systemctl --user restart order-visualizer
journalctl --user -u order-visualizer -f
```

## Architecture

```
TimescaleDB unified.synthetic_order_events   (written by UBI's order engine)
        │  SELECT only, as role order_visualizer_reader, read-only session, 5 s statement timeout
        ▼
sources/event_reader.py    ── rows newer than a moment, oldest first
        ▼
state/event_follower.py    ── polls every 2 s with a 10 s overlap; first poll reads the last 168 hours (7 days)
        ▼
state/order_book.py        ── folds rows into model/parent_order.py (legs, plan parts, timeline), ignoring repeats
        ▼
sources/depth_reader.py    ── one instrument's newest tick from unified.ticks, by index only
state/market_service.py    ── book + model/fill_estimator.py + outcome counts, cached a second per instrument
        ▼
routes/order_routes.py     ── /api/orders, /api/orders/{id}, /api/orders/{id}/market, /api/overview, and their event streams
routes/chat_routes.py      ── POST /api/chat: chat/chat_assistant.py runs Claude with chat/chat_toolbox.py
        ▼
frontend/                  ── "One order": the order list and three/planTreeScene.ts; "Whole day": a skyline of every order of a day, three/dayScene.ts
```

## Rules that are easy to break

- **The viewer must never hamper or slow UBI's order manager.** It writes nothing to UBI. It calls no UBI REST route, not even `GET /api/orders/parents`, whose workers also place orders.
- **Read only the event table, only as `order_visualizer_reader`.** That role has `SELECT` on `unified.synthetic_order_events` and nothing else. Never fall back to UBI's own database user.
- **Every query of `unified.ticks` names one instrument and a window of minutes.** The table is huge; an unbounded count on 2026-10-02 ran for minutes. See `.claude/notes/order_visualizer/sources/depth_reader.py.md`.
- **The chat sends order data to Anthropic.** It is off unless `ORDER_VISUALIZER_ANTHROPIC_API_KEY` is set. Its history is append-only, as Claude Opus 5.5 requires.
- **Order book readings are estimates, and the page says so.** Never present them as predictions.
- **Do not read UBI's Redis.** On 2026-10-02 it held 13.37 GB, so a replica's full sync would fork it and copy all of that, and replicating would need a new Redis user. The user chose the event table only; live prices are deferred.
- **Every order route is GET.** A test checks that writing methods are refused. The only POST routes are login, logout and `/api/chat`, none of which touch UBI.
- **The server runs below UBI's priority.** `services/order-visualizer.service` sets `Nice=`, `CPUQuota=`, `CPUWeight=` and an idle I/O class. All 3D drawing happens in the browser.
- **uvicorn runs one worker.** The order book lives in memory.

## Testing a second copy

The database role allows 3 connections and the service uses up to 2, so a second copy started for testing can exceed the limit once it opens the order book. Start a test copy on `127.0.0.1` (not `localhost`), so its session cookie does not overwrite the real viewer's cookie on `localhost:8105`.

## Conventions

The user's global rules in `~/.claude/CLAUDE.md` apply: class-based code, Google docstrings with `Args:`, `Returns:` and `Raises:` on every function, full names, one collection element per line, no explanatory comments in code or config files, and reasoning in `.claude/notes/<source path>.md`.
