# Licensing

The Powabase self-host stack (`powabase`) is **source-available** under the
[PolyForm Noncommercial License 1.0.0](LICENSE)
(SPDX: `PolyForm-Noncommercial-1.0.0`). Commercial use requires a
Powabase enterprise agreement.

## Free use — no agreement needed

You may use, modify, and redistribute this software at no cost if you are:

- a **government institution** (national, regional, or local government, or a public agency);
- a **public research organization**, university, or other educational institution;
- a charitable, public safety or health, or environmental protection organization; or
- an individual using it for personal research, experimentation, testing, study, or hobby
  projects **with no anticipated commercial application**.

This applies however your organization is funded.

## Commercial use — enterprise agreement required

Any other use, including use by or for a for-profit company, needs a commercial license
through a Powabase enterprise agreement. That covers:

- running it in production, internally or for customers;
- building it into a product or service you sell;
- hosting it for others; and
- evaluating it for any of the above.

To get a commercial license, contact **hello@powabase.ai** or see
<https://powabase.ai/pricing#enterprise>. If you would rather not run it yourself, the
hosted Powabase platform at <https://powabase.ai> is an alternative.

## Earlier versions

Releases and commits published before this change (up to and including
**v0.8.0**) were published under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), and they remain
available under that license. This change applies to later releases only.

## Third-party components

Third-party software keeps its own license. The Supabase data-plane images the stack runs (GoTrue, PostgREST, Storage, Realtime, postgres-meta, Postgres, and Kong) are used unchanged under their own licenses, as are the other third-party images it pulls (Redis and imgproxy). The Studio dashboard in [`frontend/`](frontend/) is a fork of Supabase Studio and remains under the Apache License 2.0; see [`frontend/LICENSE`](frontend/LICENSE) and [`frontend/apps/studio/NOTICE`](frontend/apps/studio/NOTICE). The `powabase-ai` backend image the stack runs is licensed separately under the PolyForm Noncommercial License 1.0.0; see <https://github.com/powabase-ai/powabase-ai>.

## Contributing

Contributions are accepted under the terms in [CONTRIBUTING.md](CONTRIBUTING.md#licensing-of-contributions).
These terms let Powabase AI offer the project under both the noncommercial license
and commercial licenses.

## Questions

If you are not sure whether your use counts as noncommercial, email
**hello@powabase.ai** before you deploy.
