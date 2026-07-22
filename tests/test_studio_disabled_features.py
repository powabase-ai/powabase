import pathlib
import re

OSS = pathlib.Path(__file__).resolve().parents[1]   # repo root
DOCKERFILE = OSS / "frontend/apps/studio/Dockerfile"

# billing:ai_on_us + credits:activity are ALREADY false in enabled-features.json
# (:32, :40) -- only the default-true keys need disabling here (C3.1).
DISABLED_FEATURES_VALUE = "billing:all,billing:plan_picker,credits:enabled"


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


def _dockerfile_text():
    return DOCKERFILE.read_text()


def _oss_publish_workflow_text():
    # The published powabase-studio image bakes the build-time NEXT_PUBLIC_* args;
    # in this repo that's .github/workflows/publish.yml.
    wf = OSS / ".github/workflows/publish.yml"
    assert wf.exists(), "publish.yml not found at .github/workflows/"
    return wf.read_text()


def test_studio_build_args_disable_billing_and_credits():
    # LOAD-BEARING. NEXT_PUBLIC_* vars are inlined into the Next.js bundle at
    # BUILD time (the compiler replaces process.env.NEXT_PUBLIC_* with a literal
    # during `next build`), so the disable must be a BUILD arg, not runtime env.
    # P1 Task 3 pinned the compose to a pre-built image, so the bake moved out of
    # the compose build: block and into oss-publish.yml's studio build-args — the
    # invariant is unchanged, only its home. (The compose `environment:` copy that
    # test_studio_environment_carries_the_same_value_for_parity checks is inert.)
    wf = _oss_publish_workflow_text()
    assert f"NEXT_PUBLIC_DISABLED_FEATURES={DISABLED_FEATURES_VALUE}" in wf, (
        "oss-publish.yml studio build-args must set NEXT_PUBLIC_DISABLED_FEATURES -- "
        "environment: alone is inert for a NEXT_PUBLIC_* var, so the published image "
        "must bake the disable at build time (the anon-key-gap class of bug, C1.2)."
    )


def test_studio_build_arg_forces_is_platform_false():
    # LOAD-BEARING and previously UNDEFENDED. The Dockerfile ARG default is
    # NEXT_PUBLIC_IS_PLATFORM=true (the platform build's default), and this var
    # is inlined at BUILD time — a runtime `environment:` override cannot correct
    # it. The self-host correctness of the ONLY image this repo publishes rests
    # entirely on publish.yml passing NEXT_PUBLIC_IS_PLATFORM=false. If that build
    # arg is ever dropped or typo'd, the published OSS image silently ships in
    # PLATFORM mode: every AI call routes to the control-plane API_URL
    # (http://localhost:5000) instead of the same-origin self-host proxy, and the
    # whole stack breaks with no runtime fix. Pin the invariant so CI catches it.
    wf = _oss_publish_workflow_text()
    assert "NEXT_PUBLIC_IS_PLATFORM=false" in wf, (
        "publish.yml studio build-args MUST set NEXT_PUBLIC_IS_PLATFORM=false -- "
        "the Dockerfile ARG defaults to true, and this NEXT_PUBLIC_* var is baked "
        "at build time (a runtime environment: override is inert), so without this "
        "build arg the published OSS image ships in platform mode and self-host breaks."
    )


def test_studio_environment_carries_the_same_value_for_parity():
    # Inert at runtime (baked at build time, like NEXT_PUBLIC_IS_PLATFORM
    # directly above it in the same block) -- kept only so `docker compose
    # config` / `docker inspect` show the effective value without
    # cross-referencing the Dockerfile.
    studio_block = _service_block(_compose_text(), "studio")
    assert f'      NEXT_PUBLIC_DISABLED_FEATURES: "{DISABLED_FEATURES_VALUE}"' in studio_block


def test_disabled_features_value_carries_the_three_load_bearing_keys():
    for key in ["billing:all", "billing:plan_picker", "credits:enabled"]:
        assert key in DISABLED_FEATURES_VALUE.split(","), f"missing {key}"
    # Do NOT add these -- already false in the shared enabled-features.json,
    # listing them here would be scope creep past what C3.1 calls for.
    assert "billing:ai_on_us" not in DISABLED_FEATURES_VALUE
    assert "credits:activity" not in DISABLED_FEATURES_VALUE


def test_enabled_features_json_is_untouched():
    # OSS must never edit the shared enabled-features.json to hide its own
    # features (that would change prod) -- the disable happens exclusively
    # via the runtime-profile override (NEXT_PUBLIC_DISABLED_FEATURES).
    shared_json = OSS / "frontend/packages/common/enabled-features/enabled-features.json"
    text = shared_json.read_text()
    assert '"billing:all": true' in text
    assert '"billing:plan_picker": true' in text
    assert '"credits:enabled": true' in text


def test_dockerfile_declares_the_build_arg():
    # Docker silently drops any build-arg the Dockerfile doesn't `ARG`-declare
    # in that stage (no error, just unconsumed) -- so without this line, the
    # docker-compose `build.args` entry above would never reach `next build`,
    # and process.env.NEXT_PUBLIC_DISABLED_FEATURES would be undefined in the
    # compiled bundle regardless of what docker-compose.yml says.
    dockerfile = _dockerfile_text()
    assert re.search(r"^ARG NEXT_PUBLIC_DISABLED_FEATURES", dockerfile, re.MULTILINE), (
        "Dockerfile must declare `ARG NEXT_PUBLIC_DISABLED_FEATURES` in the builder stage, "
        "or docker-compose's build.args entry is silently unconsumed."
    )
    assert "ENV NEXT_PUBLIC_DISABLED_FEATURES=$NEXT_PUBLIC_DISABLED_FEATURES" in dockerfile, (
        "the ARG must be promoted to ENV before `next build` runs, or process.env won't see it."
    )


def test_dockerfile_arg_wired_before_next_build_runs():
    # Ordering matters: both the ARG and ENV lines must precede the
    # `next build` RUN step in the same build stage, or the var isn't in
    # scope for the compiler that does the NEXT_PUBLIC_* inlining.
    dockerfile = _dockerfile_text()
    arg_pos = dockerfile.index("ARG NEXT_PUBLIC_DISABLED_FEATURES")
    env_pos = dockerfile.index("ENV NEXT_PUBLIC_DISABLED_FEATURES=$NEXT_PUBLIC_DISABLED_FEATURES")
    build_pos = dockerfile.index("next build")
    assert arg_pos < env_pos < build_pos
