"""PolyForm Noncommercial for this repo; frontend/ (Studio fork) stays Apache-2.0
and its NOTICE credits Supabase (spec §6.6)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]   # repo root
STACK_LICENSE = ROOT / "LICENSE"
FRONTEND_LICENSE = ROOT / "frontend/LICENSE"
STUDIO_NOTICE = ROOT / "frontend/apps/studio/NOTICE"


def test_stack_license_is_polyform_noncommercial():
    assert STACK_LICENSE.exists(), "LICENSE missing"
    body = STACK_LICENSE.read_text()
    assert "PolyForm Noncommercial License 1.0.0" in body
    assert "Required Notice: Copyright 2026 Powabase AI" in body


def test_licensing_doc_exists():
    assert (ROOT / "LICENSING.md").is_file(), "LICENSING.md missing"


def test_frontend_license_is_apache():
    assert FRONTEND_LICENSE.exists(), "frontend/LICENSE missing"
    body = FRONTEND_LICENSE.read_text()
    assert "Apache License" in body
    assert "Version 2.0" in body


def test_studio_notice_credits_supabase():
    assert STUDIO_NOTICE.exists(), "studio NOTICE missing"
    body = STUDIO_NOTICE.read_text()
    assert "Supabase" in body
    assert "Apache License" in body or "Apache-2.0" in body
    assert "frontend/LICENSE" in body, "NOTICE must point at frontend/LICENSE"
