# Changelog

## [0.6.0](https://github.com/powabase-ai/powabase/compare/v0.5.0...v0.6.0) (2026-08-26)


### Features

* show provisioning progress and failures on the project home ([#38](https://github.com/powabase-ai/powabase/issues/38)) ([67180f9](https://github.com/powabase-ai/powabase/commit/67180f9e3c459977ec5a76aea39458de22592f36))

## [0.5.0](https://github.com/powabase-ai/powabase/compare/v0.4.1...v0.5.0) (2026-08-13)


### Features

* **copilot:** project copilot panel + guide walkthroughs ([#34](https://github.com/powabase-ai/powabase/issues/34)) ([f8745ce](https://github.com/powabase-ai/powabase/commit/f8745ce078a7cbe7778579ee98bbdf52503ae6db))
* **onboarding:** data-onboarding-id anchor primitive ([#33](https://github.com/powabase-ai/powabase/issues/33)) ([da1c4e6](https://github.com/powabase-ai/powabase/commit/da1c4e6189b7f7dbaf39a00d8d430cdbe9635366))

## [0.4.1](https://github.com/powabase-ai/powabase/compare/v0.4.0...v0.4.1) (2026-08-10)


### Bug Fixes

* follow redirect_url when the authorization server auto-approves ([#35](https://github.com/powabase-ai/powabase/issues/35)) ([79d378e](https://github.com/powabase-ai/powabase/commit/79d378e523a9e2977fdf6f601cec9f0e40aadcd1))

## [0.4.0](https://github.com/powabase-ai/powabase/compare/v0.3.0...v0.4.0) (2026-08-07)


### Features

* add "Continue with Google" sign-in behind a build-arg flag ([#32](https://github.com/powabase-ai/powabase/issues/32)) ([5536154](https://github.com/powabase-ai/powabase/commit/55361547c9348d9ec6444ec1ff5b4fd1a8b823d3))


### Bug Fixes

* **compose:** pin powabase-ai 0.4.0 and studio 0.3.0 for self-host ([#29](https://github.com/powabase-ai/powabase/issues/29)) ([14cc9ed](https://github.com/powabase-ai/powabase/commit/14cc9edc0046a6f95494dda5ab04f81c9d557310))

## [0.3.0](https://github.com/powabase-ai/powabase/compare/v0.2.0...v0.3.0) (2026-08-07)


### Features

* **studio:** per-message knowledge base references in agent playground ([#27](https://github.com/powabase-ai/powabase/issues/27)) ([7010b3e](https://github.com/powabase-ai/powabase/commit/7010b3e39b590c0317dd313326d4bc3083e946f7))


### Bug Fixes

* **compose:** pin powabase-ai 0.3.1 and studio 0.2.0 for self-host ([#26](https://github.com/powabase-ai/powabase/issues/26)) ([ef81b90](https://github.com/powabase-ai/powabase/commit/ef81b90c6065b9ae432bccf4b6c026bf5f1cfe3a))

## [0.2.0](https://github.com/powabase-ai/powabase/compare/v0.1.1...v0.2.0) (2026-08-05)


### Features

* add error_code column to ai.sources schema ([c1524a7](https://github.com/powabase-ai/powabase/commit/c1524a7212fe718537a68226053c649f805e3ffd))


### Bug Fixes

* **ci:** re-run the title check when the head moves ([#24](https://github.com/powabase-ai/powabase/issues/24)) ([c51c43a](https://github.com/powabase-ai/powabase/commit/c51c43af08f26f74e470f8e454de1582358ad550))

## [0.1.1](https://github.com/powabase-ai/powabase/compare/v0.1.0...v0.1.1) (2026-08-05)


### Bug Fixes

* **ci:** drop '| head' from manifest inspect (SIGPIPE+pipefail failed the step post-push) ([81dc121](https://github.com/powabase-ai/powabase/commit/81dc12122f8ed5a9e53a116fb220bbd7adaf4136))
* **self-host:** resolve 8 verified defects from the audit sweep ([#4](https://github.com/powabase-ai/powabase/issues/4)) ([8ec646b](https://github.com/powabase-ai/powabase/commit/8ec646bc4a7c2a046194b6adaf67e47b673a842b))
* **stack:** snippets persistence, storage dir, python3, smoke client-check ([966eebf](https://github.com/powabase-ai/powabase/commit/966eebf631c8035b68b51001469fa1f4d64586a6))
* **studio:** gate self-host client defects (whoami, billing hooks, manifest) ([d99c88e](https://github.com/powabase-ai/powabase/commit/d99c88eb311290982a33fbb3b8c83680822ae7bc))
* **studio:** omit Authorization header on self-host AI calls ([79e6e4b](https://github.com/powabase-ai/powabase/commit/79e6e4bc629122d47d680f3e5c0ec9814e1fd4f0))
* **studio:** omit Authorization header on self-host AI calls ([21fcb1a](https://github.com/powabase-ai/powabase/commit/21fcb1a3643a616bbaea8449c5bfff51df34c1ce))
