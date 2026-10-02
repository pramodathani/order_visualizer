# sql/grant_ticks_read.sql

Lets the viewer's read-only role read `unified.ticks` for the order book panel, which the user approved on 2026-10-02. The role keeps `default_transaction_read_only`, the statement timeout and the connection limit from `create_reader_role.sql`. TimescaleDB passes the grant on to every chunk, including future ones.
