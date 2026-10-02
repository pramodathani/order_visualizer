CREATE ROLE order_visualizer_reader LOGIN PASSWORD :'reader_password' CONNECTION LIMIT 3;
ALTER ROLE order_visualizer_reader SET default_transaction_read_only = on;
ALTER ROLE order_visualizer_reader SET statement_timeout = '5s';
ALTER ROLE order_visualizer_reader SET idle_in_transaction_session_timeout = '10s';
GRANT CONNECT ON DATABASE :"database_name" TO order_visualizer_reader;
GRANT USAGE ON SCHEMA unified TO order_visualizer_reader;
GRANT SELECT ON unified.synthetic_order_events TO order_visualizer_reader;
