import pathlib
import re

OSS = pathlib.Path(__file__).resolve().parents[1]


def _service_block(compose_text: str, service_name: str) -> str:
    """Extract one top-level service's YAML block (from `  <service>:` up to
    the next top-level `  <key>:` line), without adding a PyYAML dependency —
    mirrors test_env_compose_parity.py's regex-only style."""
    lines = compose_text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if re.match(rf"^  {re.escape(service_name)}:\s*$", line):
            start = i + 1
            break
    assert start is not None, f"service {service_name!r} not found in docker-compose.yml"
    end = len(lines)
    for i in range(start, len(lines)):
        if re.match(r"^  [A-Za-z]", lines[i]):  # next top-level service/volume/network key
            end = i
            break
    return "\n".join(lines[start:end])


def _compose_text():
    return (OSS / "docker-compose.yml").read_text()


def test_studio_receives_the_real_postgres_password():
    # frontend/apps/studio/lib/api/self-hosted/constants.ts POSTGRES_PASSWORD
    # falls back to the literal string 'postgres' when process.env.POSTGRES_PASSWORD
    # is unset. Every pg-meta /query call (SQL Editor + Table Editor row/entity
    # fetch, both via lib/api/self-hosted/query.ts executeQuery -> getConnectionString)
    # builds a Postgres connection string from that value — with the fallback,
    # it's the wrong password and pg-meta's connection to `db` fails on every call.
    studio_env = _service_block(_compose_text(), "studio")
    assert "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}" in studio_env


def test_studio_receives_the_real_pg_meta_crypto_key():
    # constants.ts ENCRYPTION_KEY falls back to the literal 'SAMPLE_KEY' when
    # process.env.PG_META_CRYPTO_KEY is unset. Studio encrypts the connection
    # string with this key and sends it as the x-connection-encrypted header;
    # the `meta` service decrypts it with its own CRYPTO_KEY (the real
    # generated secret). A mismatched key breaks decryption on every /query call.
    compose = _compose_text()
    studio_env = _service_block(compose, "studio")
    meta_env = _service_block(compose, "meta")
    assert "PG_META_CRYPTO_KEY: ${PG_META_CRYPTO_KEY}" in studio_env
    # sanity: confirm `meta` is keyed off the same source .env var, otherwise
    # the assertion above could pass while still pointing at mismatched secrets.
    assert "CRYPTO_KEY: ${PG_META_CRYPTO_KEY}" in meta_env


def test_studio_receives_the_real_postgres_db_name():
    # Same failure shape as POSTGRES_PASSWORD if an operator ever renames
    # POSTGRES_DB in .env: constants.ts defaults to 'postgres', which would
    # silently diverge from `db`'s actual POSTGRES_DB value.
    studio_env = _service_block(_compose_text(), "studio")
    assert "POSTGRES_DB: ${POSTGRES_DB}" in studio_env
