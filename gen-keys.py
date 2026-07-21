#!/usr/bin/env python3
"""Generate per-deployment secrets for the OSS single-project stack.

Mirrors the control plane's generate_project_secrets() KEY SHAPES, with one
intentional divergence: the anon/service-role JWT iat/exp are a fresh 5-year
window computed from time.time() at generation, whereas the control plane signs
a fixed literal exp. (Shapes match; the expiry window deliberately does not.)
Every value is regenerated FRESH on each run (nothing is derived from the
previous .env), so re-running ROTATES every
secret and is DESTRUCTIVE to a running stack: a new POSTGRES_PASSWORD locks you
out of the already-initialized database, and a new API_KEY_ENCRYPTION_KEY makes
every stored provider key permanently undecryptable. To guard against that, this
REFUSES to overwrite existing non-empty secrets in ./.env unless you pass
--force. First run (fresh/empty .env) writes all secrets; non-secret lines are
always preserved.

Deps: PyJWT, cryptography   ->   pip install pyjwt cryptography
Usage: python gen-keys.py            # first run: write secrets into ./.env
       python gen-keys.py --force    # re-run: ROTATE all secrets (destructive)
"""
import os
import pathlib
import secrets
import sys
import time

import jwt
from cryptography.fernet import Fernet

MANAGED_KEYS = [
    "POSTGRES_PASSWORD", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY",
    "DASHBOARD_USERNAME", "DASHBOARD_PASSWORD", "PG_META_CRYPTO_KEY",
    "SECRET_KEY_BASE", "API_KEY_ENCRYPTION_KEY",
]


def generate_secret(length: int = 32) -> str:
    return secrets.token_urlsafe(length)[:length]


def generate_jwt_key(jwt_secret: str, role: str) -> str:
    now = int(time.time())
    payload = {"role": role, "iss": "supabase", "iat": now, "exp": now + 5 * 365 * 24 * 3600}
    return jwt.encode(payload, jwt_secret, algorithm="HS256")


def build_values() -> dict[str, str]:
    jwt_secret = generate_secret(48)
    return {
        "POSTGRES_PASSWORD": generate_secret(32),
        "JWT_SECRET": jwt_secret,
        "ANON_KEY": generate_jwt_key(jwt_secret, "anon"),
        "SERVICE_ROLE_KEY": generate_jwt_key(jwt_secret, "service_role"),
        "DASHBOARD_USERNAME": "supabase",
        "DASHBOARD_PASSWORD": generate_secret(16),
        "PG_META_CRYPTO_KEY": generate_secret(32),
        "SECRET_KEY_BASE": secrets.token_hex(32),
        "API_KEY_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    }


def existing_secrets(env_path: pathlib.Path) -> list[str]:
    """Managed keys already present in env_path with a non-empty value."""
    if not env_path.exists():
        return []
    found = []
    for line in env_path.read_text().splitlines():
        if line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() in MANAGED_KEYS and value.strip():
            found.append(key.strip())
    return found


def write_env(values: dict[str, str], env_path: pathlib.Path) -> None:
    existing = env_path.read_text().splitlines() if env_path.exists() else []
    kept = [ln for ln in existing if ln.split("=", 1)[0].strip() not in values]
    managed = [f"{k}={values[k]}" for k in MANAGED_KEYS]
    env_path.write_text("\n".join(kept + managed) + "\n")
    os.chmod(env_path, 0o600)  # secrets file: owner-only read/write


def main() -> None:
    env_path = pathlib.Path(".env")
    force = "--force" in sys.argv[1:]
    if not force and existing_secrets(env_path):
        print(
            "Refusing to overwrite existing secrets in ./.env — re-running rotates "
            "ALL secrets: a new POSTGRES_PASSWORD locks you out of the "
            "already-initialized database, and a new API_KEY_ENCRYPTION_KEY makes "
            "every stored provider key permanently undecryptable. Pass --force only "
            "if you intend to destroy this deployment's secrets.",
            file=sys.stderr,
        )
        sys.exit(1)
    write_env(build_values(), env_path)
    print("Wrote secrets to ./.env (" + ", ".join(MANAGED_KEYS) + ")")


if __name__ == "__main__":
    main()
