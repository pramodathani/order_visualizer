# order_visualizer/sources/event_reader.py

The connection marks itself read-only in three independent ways: the role's grants allow only SELECT, the role's default makes every transaction read-only, and the connection options and `set_session(readonly=True)` say so again. Any one of them would stop a write.

Autocommit is on so that each SELECT runs in its own short transaction. A long-open transaction would hold back vacuum and could delay the table's columnstore policy, which compresses chunks older than seven days.

The query filters on `"time"`, which has its own index (`synthetic_order_events_time_idx`) and is the hypertable's partitioning column, so TimescaleDB only opens the newest chunk on a normal poll.

On any `psycopg2.Error` the connection is closed and the error raised, so the next poll connects afresh. The follower catches and logs the error.
