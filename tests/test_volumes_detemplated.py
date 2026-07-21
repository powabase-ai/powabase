import pathlib
OSS = pathlib.Path(__file__).resolve().parents[1]

def test_all_init_sql_present():
    for name in ["ai_schema.sql","jwt.sql","realtime.sql","roles.sql","webhooks.sql","mark-ready.sql"]:
        assert (OSS / "volumes/db" / name).is_file(), f"missing {name}"

def test_no_unresolved_placeholders_anywhere_in_volumes():
    for p in (OSS / "volumes").rglob("*"):
        if p.is_file():
            assert "{{" not in p.read_text(), f"unresolved placeholder in {p}"

def test_kong_present():
    assert (OSS / "volumes/api/kong.yml").is_file()
