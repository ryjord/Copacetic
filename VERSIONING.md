# Versioning

Four positions, each with one job. Read a version and you know what changed.

```
v1 . 2 . 3 - beta.4
│    │   │        │
│    │   │        └─ private: betas and internal builds, never a public release
│    │   └────────── fixes: bug fixes, small changes, logging, docs
│    └────────────── features: something new, or something worth showing off
└─────────────────── major: a release we are proud of, big changes
```

## The positions

**Major — `2.0.0`.** Reserved. This is the number that says the product changed
shape, not that it accumulated enough small things. A major is a decision, not
an arithmetic consequence.

**Minor — `1.2.0`.** A new capability, or something genuinely worth announcing.
If a user would notice it and care, it belongs here.

**Patch — `1.0.1`.** Bug fixes, hardening, performance, logging, docs, test
coverage, dependency bumps. Nothing a user has to learn.

**Private — `1.2.0-beta.1`.** Betas, release candidates and internal builds.
Never promoted to a public release under that name; when it is ready, it ships
as the plain version with the suffix dropped.

## Why the private position is a suffix, not a fourth number

`1.2.3.4` cannot be used. It is not valid semver, and three things in this repo
reject it outright:

- `package.json#version` — npm refuses to install or publish with it
- `electron-builder` — derives installer and update metadata from a semver version
- `electron-updater` — compares versions with semver precedence rules

`1.2.3-beta.4` does the same job and is valid everywhere. It also sorts
_before_ `1.2.3`, which is the correct relationship: a beta precedes the
release it is a beta of. Auto-update treats prerelease versions as a separate
channel, so a beta never reaches someone on the stable channel by accident —
which is exactly the "we keep it private" behaviour, enforced by the tooling
rather than by remembering.

Valid private forms, in order:

```
1.2.0-alpha.1   →   1.2.0-beta.1   →   1.2.0-rc.1   →   1.2.0
```

## How a release happens

1. Work lands on `development` through pull requests.
2. `package.json#version` is set to the release version on `development`.
3. `CHANGELOG.md` gets a section for it, written for a person, not a diff.
4. `development` merges into `main`.
5. Tagging `v<version>` on `main` triggers the release workflow, which builds
   and publishes installers for macOS, Windows and Linux.

The tag is the publish action. Nothing reaches a user until it exists, so a
merge to `main` is safe and reversible in a way a tag is not.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) —
`type(scope): summary`. The type is what decides the next version:

| Commit type                            | Moves                           |
| -------------------------------------- | ------------------------------- |
| `feat`                                 | minor                           |
| `fix`, `perf`, `refactor`              | patch                           |
| `docs`, `test`, `ci`, `build`, `chore` | patch, or nothing if unreleased |
| any commit with `BREAKING CHANGE`      | major, and only deliberately    |
