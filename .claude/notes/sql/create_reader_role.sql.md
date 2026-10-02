# sql/create_reader_role.sql

Creates the only database login the viewer uses. `bin/create-reader-role` runs it once through `psql` inside UBI's TimescaleDB container, logged in as UBI's own database user, and passes two psql variables: `reader_password` (a fresh random password) and `database_name`.

- `GRANT SELECT` on the one table, plus `USAGE` on the `unified` schema and `CONNECT` on the database, is the whole grant. The role cannot read any other table and cannot write anything.
- TimescaleDB passes a hypertable's grants on to its chunks, including chunks created later, so the single `GRANT SELECT` covers every day of data.
- `default_transaction_read_only = on` is a second guard in case a grant is ever widened by mistake.
- `statement_timeout = '5s'` stops a slow query on the database side, so the viewer cannot hold a query open against the engine's table.
- `idle_in_transaction_session_timeout = '10s'` drops a session that opened a transaction and stalled, so it cannot hold locks that would delay the columnstore policy or chunk maintenance.
- `CONNECTION LIMIT 3` keeps the role from using up the database's connections if the viewer misbehaves. The viewer holds one connection.

Running the file a second time fails at `CREATE ROLE` because the role exists. To change the password, run `ALTER ROLE order_visualizer_reader PASSWORD '...'` instead.
