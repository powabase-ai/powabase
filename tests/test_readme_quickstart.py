import pathlib
OSS = pathlib.Path(__file__).resolve().parents[1]
def test_readme_lists_the_real_quickstart_steps():
    t = (OSS / "README.md").read_text()
    # `python3`, not `python`: the quickstart was changed in rc2 because current
    # Ubuntu/Debian ship no bare `python`. This assertion lagged that change.
    for needle in ["cp .env.example .env", "python3 gen-keys.py", "docker compose up", "docker compose ps"]:
        assert needle in t, f"README missing step: {needle}"
    # F5: smoke-test.sh runs `down -v` (destructive) — it must NOT be the
    # quickstart verify step, and the README must warn it wipes volumes.
    assert "./smoke-test.sh" not in t, "smoke-test.sh must not be a quickstart command (it wipes volumes)"
    assert "destructive" in t.lower(), "README must warn that smoke-test.sh is destructive"
