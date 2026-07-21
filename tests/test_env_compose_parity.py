import pathlib, re
OSS = pathlib.Path(__file__).resolve().parents[1]

def _declared_keys():
    keys = set()
    for line in (OSS / ".env.example").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            keys.add(line.split("=", 1)[0])
    # secrets come from gen-keys.py, not .env.example:
    keys |= {"POSTGRES_PASSWORD","JWT_SECRET","ANON_KEY","SERVICE_ROLE_KEY",
             "DASHBOARD_USERNAME","DASHBOARD_PASSWORD","PG_META_CRYPTO_KEY",
             "SECRET_KEY_BASE","API_KEY_ENCRYPTION_KEY"}
    return keys

def test_env_example_declares_required_static_vars():
    keys = _declared_keys()
    for required in ["PROJECT_ID", "PROJECT_NAME", "POSTGRES_HOST", "POSTGRES_DB",
                     "POSTGRES_PORT", "KONG_HTTP_PORT", "KONG_HTTPS_PORT",
                     "PGRST_DB_SCHEMAS", "SITE_URL", "API_EXTERNAL_URL", "OPENAI_API_KEY"]:
        assert required in keys, f".env.example missing {required}"

def test_pgrst_schemas_excludes_ai():
    # ai is a Class-B (private/backend) schema — see
    # docs/database-roles-and-scopes.md §7. It must not be REST-exposed.
    text = (OSS / ".env.example").read_text()
    assert "PGRST_DB_SCHEMAS=public,storage\n" in text
    assert "PGRST_DB_SCHEMAS=public,storage,ai" not in text

import subprocess, shutil, os

def test_every_bare_compose_var_is_declared():
    # The RELIABLE completeness check. `docker compose config` returns 0 even
    # when a bare ${VAR} is unset (it only warns), so returncode is NOT a
    # completeness signal — this set-diff is. ${VAR:-default} is self-satisfying;
    # only bare ${VAR} must be declared by .env.example or gen-keys.
    import re
    compose = (OSS / "docker-compose.yml").read_text()
    bare = set(re.findall(r"\$\{([A-Z0-9_]+)\}", compose))
    missing = bare - _declared_keys()   # from Task 2: .env.example keys + gen-keys secrets
    assert not missing, f"compose references undeclared bare vars: {sorted(missing)}"

def test_compose_config_is_schema_valid(tmp_path):
    work = tmp_path / "oss"
    shutil.copytree(OSS, work, ignore=shutil.ignore_patterns(".env", "__pycache__"))
    shutil.copy(work / ".env.example", work / ".env")
    subprocess.run(["python", "gen-keys.py"], cwd=work, check=True)
    # OPENAI_API_KEY has a `${...:?}` fail-fast guard in the compose (empty = hard
    # error); a shell env var overrides the empty .env value, so inject a dummy to
    # exercise schema validity without a real key.
    env = {**os.environ, "OPENAI_API_KEY": "dummy"}
    r = subprocess.run(["docker", "compose", "config"], cwd=work, capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr   # schema validity only (NOT completeness — see test above)

def test_compose_has_no_placeholders():
    assert "{{" not in (OSS / "docker-compose.yml").read_text()
