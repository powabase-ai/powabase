import subprocess, sys, pathlib
import time
import jwt
from cryptography.fernet import Fernet

OSS = pathlib.Path(__file__).resolve().parents[1]

MANAGED_KEYS = ["POSTGRES_PASSWORD", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY",
                "DASHBOARD_USERNAME", "DASHBOARD_PASSWORD", "PG_META_CRYPTO_KEY",
                "SECRET_KEY_BASE", "API_KEY_ENCRYPTION_KEY"]

def _run_and_load(tmp_path):
    env = tmp_path / ".env"
    env.write_text("")  # start from empty
    subprocess.run([sys.executable, str(OSS / "gen-keys.py")], cwd=tmp_path, check=True)
    return dict(
        line.split("=", 1) for line in env.read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    )

def _load(env_path):
    return dict(
        line.split("=", 1) for line in env_path.read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    )

def _run(cwd, *args):
    return subprocess.run(
        [sys.executable, str(OSS / "gen-keys.py"), *args],
        cwd=cwd, capture_output=True, text=True,
    )

def test_all_secret_keys_present(tmp_path):
    vals = _run_and_load(tmp_path)
    for key in ["POSTGRES_PASSWORD", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY",
                "DASHBOARD_USERNAME", "DASHBOARD_PASSWORD", "PG_META_CRYPTO_KEY",
                "SECRET_KEY_BASE", "API_KEY_ENCRYPTION_KEY"]:
        assert vals.get(key), f"missing {key}"

def test_secret_shapes_match_control_plane(tmp_path):
    # These shapes mirror the control plane's generate_project_secrets() as of
    # 2026-07; they are intentionally hardcoded here (not imported) to keep the
    # OSS edition standalone and decoupled from the control-plane package.
    vals = _run_and_load(tmp_path)
    assert len(vals["JWT_SECRET"]) == 48
    assert len(vals["POSTGRES_PASSWORD"]) == 32
    assert len(vals["PG_META_CRYPTO_KEY"]) == 32
    assert len(vals["DASHBOARD_PASSWORD"]) == 16
    assert len(bytes.fromhex(vals["SECRET_KEY_BASE"])) == 32  # token_hex(32)
    assert vals["DASHBOARD_USERNAME"] == "supabase"

def test_anon_and_service_keys_are_valid_jwts(tmp_path):
    vals = _run_and_load(tmp_path)
    for key, role in [("ANON_KEY", "anon"), ("SERVICE_ROLE_KEY", "service_role")]:
        claims = jwt.decode(vals[key], vals["JWT_SECRET"], algorithms=["HS256"])
        assert claims["role"] == role
        assert claims["iss"] == "supabase"

def test_encryption_key_is_valid_fernet(tmp_path):
    vals = _run_and_load(tmp_path)
    Fernet(vals["API_KEY_ENCRYPTION_KEY"].encode())  # raises if malformed

def test_jwt_expiry_is_a_fresh_five_year_window_from_now(tmp_path):
    # Fix ②: iat/exp are computed from NOW (fresh 5-year window per self-hoster),
    # NOT Supabase's demo 2022->2027 literals. Fails against the old fixed
    # exp:1799535600 because that timestamp is not far enough in the future.
    vals = _run_and_load(tmp_path)
    now = int(time.time())
    claims = jwt.decode(vals["ANON_KEY"], vals["JWT_SECRET"], algorithms=["HS256"])
    span = claims["exp"] - claims["iat"]
    year = 365 * 24 * 3600
    assert 4.9 * year <= span <= 5.1 * year          # ~5-year validity window
    assert claims["exp"] > now + 4 * year            # far future (old 2027 literal fails)

def test_fresh_env_writes_all_and_preserves_non_managed(tmp_path):
    # Fix ① (a): fresh .env (managed keys empty/absent) -> all 9 written, exit 0,
    # non-managed lines preserved.
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=sk-test\nJWT_SECRET=\n")  # non-managed + empty managed
    r = _run(tmp_path)
    assert r.returncode == 0, r.stderr
    vals = _load(env)
    for key in MANAGED_KEYS:
        assert vals.get(key), f"missing {key}"
    assert vals["OPENAI_API_KEY"] == "sk-test"       # non-managed untouched

def test_refuses_overwrite_of_existing_secrets_without_force(tmp_path):
    # Fix ① (b): existing NON-EMPTY managed secret + no --force -> refuse (exit != 0),
    # existing value preserved unchanged.
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=sk-test\nJWT_SECRET=OLD\n")
    r = _run(tmp_path)
    assert r.returncode != 0
    assert "Refusing to overwrite existing secrets in ./.env" in r.stderr
    assert "POSTGRES_PASSWORD" in r.stderr and "API_KEY_ENCRYPTION_KEY" in r.stderr
    assert "--force" in r.stderr
    text = env.read_text()
    assert "JWT_SECRET=OLD" in text                  # preserved, not rotated
    assert "OPENAI_API_KEY=sk-test" in text

def test_force_overwrites_existing_secrets(tmp_path):
    # Fix ① (c): --force rotates existing managed secrets; non-managed preserved.
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=sk-test\nJWT_SECRET=OLD\n")
    r = _run(tmp_path, "--force")
    assert r.returncode == 0, r.stderr
    text = env.read_text()
    assert "JWT_SECRET=OLD" not in text              # rotated
    assert "OPENAI_API_KEY=sk-test" in text          # non-managed preserved
    assert text.count("JWT_SECRET=") == 1            # not duplicated

def test_secrets_are_unique_across_runs(tmp_path):
    # Pins per-deployment randomness: two independent gen-keys runs must produce
    # DIFFERENT random secrets. Fails if generate_secret() ever regresses to a
    # constant — which would ship identical secrets to every deployment, making
    # JWTs forgeable (a shared JWT_SECRET lets anyone mint service_role tokens).
    # DASHBOARD_USERNAME is the one intentional constant ("supabase").
    d1 = tmp_path / "a"; d1.mkdir()
    d2 = tmp_path / "b"; d2.mkdir()
    a = _run_and_load(d1)
    b = _run_and_load(d2)
    for key in ["POSTGRES_PASSWORD", "JWT_SECRET", "PG_META_CRYPTO_KEY",
                "DASHBOARD_PASSWORD", "SECRET_KEY_BASE", "API_KEY_ENCRYPTION_KEY",
                "ANON_KEY", "SERVICE_ROLE_KEY"]:
        assert a[key] != b[key], f"{key} identical across runs — randomness regressed"
    assert a["DASHBOARD_USERNAME"] == b["DASHBOARD_USERNAME"] == "supabase"

def test_env_file_is_owner_only_0600(tmp_path):
    # The .env holds every deployment secret; gen-keys.py chmods it to 0600 so
    # only the owner can read/write it. Fails if the chmod is dropped.
    _run_and_load(tmp_path)
    env = tmp_path / ".env"
    assert env.stat().st_mode & 0o777 == 0o600
