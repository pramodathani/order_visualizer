# order_visualizer/routes/order_routes.py

Every route is GET and lives behind the login session. There is no route that writes, because there is nothing for the viewer to write.

The streams poll the in-memory book once a second, which costs nothing on UBI's side; only the follower talks to the database. The order list stream also changes when the follower's last success time or last error changes, so the header's "read N seconds ago" stays honest even when no order changes.

A parent id is checked to be a UUID before it is used, so the routes never pass arbitrary text anywhere.
