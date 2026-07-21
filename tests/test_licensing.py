"""Apache-2.0 for this repo; Studio NOTICE credits Supabase (spec §6.6)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]   # repo root
STACK_LICENSE = ROOT / "LICENSE"
STUDIO_NOTICE = ROOT / "frontend/apps/studio/NOTICE"


def test_stack_license_is_apache():
    assert STACK_LICENSE.exists(), "LICENSE missing"
    assert "Apache License" in STACK_LICENSE.read_text()
    assert "Version 2.0" in STACK_LICENSE.read_text()


def test_studio_notice_credits_supabase():
    assert STUDIO_NOTICE.exists(), "studio NOTICE missing"
    body = STUDIO_NOTICE.read_text()
    assert "Supabase" in body
    assert "Apache License" in body or "Apache-2.0" in body
