# services/order-visualizer.service

The unit runs the viewer below UBI's priority, so it cannot take CPU or disk time from the order engine.

| Setting | Effect |
|---|---|
| `Nice=15` | The scheduler prefers every normal-priority process, including UBI's, over the viewer. |
| `CPUWeight=20` | Under contention the viewer's cgroup gets a fifth of the default share. |
| `CPUQuota=50%` | The viewer can never use more than half of one core, even on an idle machine. |
| `IOSchedulingClass=idle` | The viewer's disk reads wait until nothing else wants the disk. |
| `MemoryMax=1G` | A runaway order book is killed rather than pushing UBI's processes into swap. |

Install it with `ln -s ~/Projects/order_visualizer/services/order-visualizer.service ~/.config/systemd/user/`, then `systemctl --user daemon-reload` and `systemctl --user enable --now order-visualizer`.
