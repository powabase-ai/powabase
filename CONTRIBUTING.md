# Contributing

Thanks for working on this project. There is one convention here that has real
consequences, so it is worth two minutes before you open a pull request.

## Your pull request title becomes the commit, and decides the release

Pull requests are squash-merged, and the squash commit takes **the pull request
title** — not your branch's commit messages. Release tooling then reads those
landed commits to decide the next version. So the title is the release decision.

A required check, `conventional-title`, enforces the format:

```
<type>: <subject>
<type>(<scope>): <subject>
```

Allowed types:

```
feat  fix  docs  test  ci  build  refactor  perf  chore  revert
```

The subject must start with a lowercase letter. A scope is optional.

```
feat(agent): add reasoning_effort parameter
fix(deps): pystemmer 3.1.0, which has a linux/arm64 wheel
docs: explain the release flow
```

**If the check fails, edit the title in the GitHub UI.** It re-runs on the edit —
no new commit, no force-push, nothing to rebase.

## Which types cut a release

| Type | Effect |
|---|---|
| `feat` | minor version bump |
| `fix` | patch version bump |
| everything else | no release |

While the project is pre-1.0, `feat` bumps the minor rather than jumping to
`1.0.0`.

**You never have to predict this.** Release Please keeps a pull request open
titled `chore(main): release X.Y.Z`, showing the exact next version and the
changelog it would write. Read it before merging it.

### The one trap worth knowing

If your change alters what the software *does* at runtime — including a
dependency bump that changes behaviour — use `fix` or `feat`. A `chore` title
lands the change and cuts **no release**, so nothing carrying it is ever
published. The code is merged and shipped nowhere, and nothing reports an error.

## How a release actually happens

1. Your pull request merges with a conventional title.
2. Release Please opens or updates `chore(main): release X.Y.Z`.
3. **A maintainer merges that** — this is the deliberate "ship it" decision.
4. Merging creates the git tag and the GitHub release.
5. The release triggers publishing. Nobody types a version anywhere.

Published versions are immutable. A version can never be reused, which is why
step 3 is a human decision rather than an automatic one.

## Dependency updates

Dependabot proposes them weekly with `fix(deps):` or `chore(deps-dev):` — a
production dependency change is a `fix` because it alters runtime behaviour and
must therefore cut a release; a dev-only tool is a `chore` because it does not.
Dependabot is exempt from the title check, since it generates its own titles.

## Before you open the pull request

- Run the test suite. It is a required check and will run anyway.
- Write the title as the release note you would want to read in six months.
- Put the *why* in the description. The squash body takes the pull request
  description, so it becomes part of the permanent history.
