# order_visualizer

A read-only web app that shows the order engine of unified_broker_interface (UBI) working its orders in 3D. It draws each order's plan as a tree of parts with every broker order (leg) as a tube running back in time, stands the instrument's order book beside it, shows a whole trading day as a skyline, and answers questions about the orders in a chat box that changes the view to show its answer.

The viewer never places, changes or cancels anything, and it is built so that it cannot slow the order engine down.

## What it shows

| View | What you see |
|---|---|
| One order | The order's plan as a 3D tree: parts across and down, time running away from you. Each leg is a tube that changes colour as it is sent, rests at the broker, fills, is cancelled or is rejected. Resting legs glow and carry flowing particles. |
| Order book | A five-level price ladder beside the tree at a chosen moment ("now", "when received", "when each leg was placed" or "at its last event"), with each open leg's price marked and threaded back to its tube. You can move, rotate and resize it. A panel explains where each leg stood: distance to the other side, quantity queued ahead and roughly how long that queue would take to clear, plus how finished orders of the same type actually ended. |
| Whole day | A skyline: one lane per order type, minutes running back on a time axis whose quiet stretches are squeezed into marked breaks, and one column per type and minute whose height is the number of orders that arrived, coloured by how they ended. Click a column to list its orders. |
| Chat | Ask a question such as "Why was this plan cancelled?" or "Show me the busiest minute on 27 September". Claude looks the answer up in the viewer's data and changes the view to show it. |

Twelve editor themes are available (One Dark by default, Dracula, Monokai, Nord, Gruvbox Dark, Solarized Dark and Light, Tokyo Night, Catppuccin Mocha, Night Owl, GitHub Dark and Light), and the 3D labels use JetBrains Mono.

The order book readings are estimates from five levels of depth and recent trading speed. They assume prices hold still, and the page says so; they are not predictions.

## How it stays out of the order engine's way

```
UBI order engine ──writes──► TimescaleDB unified.synthetic_order_events      unified.ticks
                                       │ SELECT, every 2 s                    │ one instrument, last 2 min, cached 1 s
                                       ▼                                      ▼
                           order_visualizer server (Nice 15, at most half a core, 1 GB)
                                       │ server-sent events
                                       ▼
                           browser (all 3D drawing happens here)
```

| Guard | What it stops |
|---|---|
| A database role that may only `SELECT` from `unified.synthetic_order_events` and `unified.ticks`, with read-only transactions, a statement timeout and a connection limit of 3 | Any write, any other table, and long or piled-up queries |
| Every `unified.ticks` query names one instrument and a window of minutes, so the table's index answers it in milliseconds | Scans of a very large table |
| No access to UBI's Redis and no calls to UBI's REST API | Load on the engine's own cache and routes |
| A systemd unit with `Nice=15`, `CPUQuota=50%`, `CPUWeight=20`, idle disk priority and `MemoryMax=1G` | Competing with UBI for CPU, disk or memory |
| Every order route is `GET`; the only `POST` routes are login, logout and chat | Using the viewer to change anything |

## Requirements

- Python 3.14 and Node.js 24 (for building the front end)
- A running unified_broker_interface with its TimescaleDB container (`unified_broker_interface-timescaledb-1`) and its `.env` file
- Optionally an Anthropic API key for the chat

## Setting it up

1. Create the virtual environment and install the server's packages.
   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```
2. Copy the example settings and adjust the path to UBI if it differs.
   ```bash
   cp .env.example .env
   chmod 600 .env
   ```
3. Create the read-only database role once. The script runs as UBI's own database user, because only the table's owner can grant on it, and writes the new role's password into `.env` without printing it.
   ```bash
   bin/create-reader-role
   bin/grant-ticks-read
   ```
4. Choose the viewer's password in a terminal, and paste the two lines it prints into `.env`.
   ```bash
   bin/set-password
   ```
5. To switch the chat on, add `ORDER_VISUALIZER_ANTHROPIC_API_KEY=...` to `.env`. Each question sends the question and the orders it looks up to Anthropic's API.
6. Build the front end.
   ```bash
   cd frontend && npm install && npm run build
   ```
7. Run it, either directly or as a systemd user service.
   ```bash
   bin/order-visualizer
   ```
   ```bash
   ln -s ~/Projects/order_visualizer/services/order-visualizer.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now order-visualizer
   ```

The viewer listens on port 8105.

## Settings

All settings are read from `ORDER_VISUALIZER_*` variables in the environment or in `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `ORDER_VISUALIZER_HOST` | `0.0.0.0` | Address the server listens on |
| `ORDER_VISUALIZER_PORT` | `8105` | Port the server listens on |
| `ORDER_VISUALIZER_PASSWORD_HASH` | empty | Argon2 hash of the viewer password, from `bin/set-password` |
| `ORDER_VISUALIZER_SESSION_SECRET` | empty | Secret that signs the login cookie, from `bin/set-password` |
| `ORDER_VISUALIZER_SESSION_MAX_AGE_SECONDS` | `43200` | How long a login lasts |
| `ORDER_VISUALIZER_UNIFIED_BROKER_INTERFACE_DIRECTORY` | `/home/pramod/Projects/unified_broker_interface` | Where UBI lives; its `.env` gives the database host, port and name |
| `ORDER_VISUALIZER_DATABASE_USERNAME` | `order_visualizer_reader` | The read-only role |
| `ORDER_VISUALIZER_DATABASE_PASSWORD` | empty | The read-only role's password, from `bin/create-reader-role` |
| `ORDER_VISUALIZER_POLL_INTERVAL_SECONDS` | `2.0` | How often new events are read |
| `ORDER_VISUALIZER_LOOKBACK_HOURS` | `168` | How much history is loaded at start |
| `ORDER_VISUALIZER_FRONTEND_DIRECTORY` | `frontend/dist` | The built front end |
| `ORDER_VISUALIZER_ANTHROPIC_API_KEY` | empty | Switches the chat on |
| `ORDER_VISUALIZER_CHAT_MODEL` | `claude-opus-5-5` | The Claude model the chat uses |

## Working on it

```bash
.venv/bin/pytest                 # server tests
.venv/bin/ruff check .           # lint
cd frontend && npm run dev       # Vite dev server on port 5176, proxying /api to 8105
cd frontend && npm run typecheck
journalctl --user -u order-visualizer -f
```

The layout follows the code's purpose:

```
order_visualizer/
├── sources/        read-only database readers (events, depth)
├── model/          orders, legs, plan parts, book snapshots, fill estimates
├── state/          the in-memory order book, the polling loop, the market service
├── chat/           the Claude assistant, its tools and conversations
├── routes/         login, orders, market, chat and the front end
└── security/       password checking and sessions
frontend/src/
├── three/          the 3D scenes, camera and labels
├── components/     React pieces: views, panels, chat box, toolbars
└── pages/          the one-order and whole-day pages
```

`CLAUDE.md` lists the project's rules, and `.claude/notes/` holds the reasoning behind each file.
