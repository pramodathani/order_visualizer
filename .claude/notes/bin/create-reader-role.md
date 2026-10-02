# bin/create-reader-role

Reads UBI's database user, password and database name from UBI's `.env` with `grep`, rather than sourcing the file, because UBI's `.env` line 1 (`PYTHONPATH=...`) is not valid shell and fails when sourced.

It runs `sql/create_reader_role.sql` with UBI's own user, because only an owner can create a role and grant on UBI's table. This is the one write the project ever makes to UBI's database, and the handoff named it as something the user runs once by hand.

The new role's password is written straight into the project's `.env` (mode 600), replacing any earlier `ORDER_VISUALIZER_DATABASE_PASSWORD` line, and is never printed. Commands run with `!` in Claude Code land in the conversation, so printing it would put the password in the transcript.
