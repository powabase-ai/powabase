-- Sentinel: last init script (999-prefix). Creates a marker file so the
-- Docker healthcheck can distinguish "init still running" from "DB ready".
COPY (SELECT '') TO '/var/lib/postgresql/data/.init_complete';
