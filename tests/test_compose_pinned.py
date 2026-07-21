"""The OSS compose must reference only pinned, published images — no :latest,
no build: contexts (spec criterion 2). Pins the exact ghcr namespace."""
from pathlib import Path

import yaml

COMPOSE = Path(__file__).resolve().parent.parent / "docker-compose.yml"
NS = "ghcr.io/powabase-ai"


def _services():
    return yaml.safe_load(COMPOSE.read_text())["services"]


def test_no_build_contexts():
    offenders = [n for n, s in _services().items() if "build" in s]
    assert not offenders, f"services still build from source: {offenders}"


def test_no_latest_and_no_unpinned():
    for name, svc in _services().items():
        image = svc.get("image", "")
        assert image, f"service {name} has no image"
        assert not image.endswith(":latest"), f"{name} pins :latest"
        assert ":" in image.rsplit("/", 1)[-1], f"{name} has no tag: {image}"


def test_powabase_images_are_pinned_ghcr():
    svcs = _services()
    ai = svcs["project-api"]["image"]
    studio = svcs["studio"]["image"]
    assert ai.startswith(f"{NS}/powabase-ai:"), ai
    assert studio.startswith(f"{NS}/powabase-studio:"), studio
    # project-worker shares the powabase-ai image
    assert svcs["project-worker"]["image"] == ai
