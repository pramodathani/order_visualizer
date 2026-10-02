# bin/grant-ticks-read

Runs `sql/grant_ticks_read.sql` as UBI's own database user, the same way `bin/create-reader-role` does, because only the table's owner can grant on it. Running it twice is harmless.
