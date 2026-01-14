---
sidebar_position: 7
---

# Contributing

We welcome contributions to Pulsarr.

## Getting Started

1. Fork the repository to your GitHub account
2. Create a branch following naming conventions (see below)
3. Make changes and ensure code quality
4. Submit a pull request to the `develop` branch

## Branch Naming

| Type | Format | Example |
|------|--------|---------|
| Feature | `feature/description` | `feature/multi-instance-sync` |
| Bug fix | `fix/description` | `fix/notification-delivery` |
| Refactor | `refactor/description` | `refactor/status-service` |
| Docs | `docs/description` | `docs/api-examples` |
| Performance | `perf/description` | `perf/query-optimization` |

## Code Quality

```bash
npm run fix          # Safe lint fixes
npm run fix:unsafe   # Import organization (if CI fails)
npm run typecheck    # TypeScript checks
```

## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/) with commitlint.

### Format

```
type(scope): description

[optional body]
```

### Types

| Type | Purpose |
|------|---------|
| `feat` | New features or functionality |
| `fix` | Bug fixes |
| `refactor` | Code changes without functional impact |
| `perf` | Performance improvements |
| `docs` | Documentation updates |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Examples

```bash
feat(router): add streaming service routing condition
fix(client): resolve variable shadowing in mutation handlers
refactor(watchlist-status): extract unified status sync module
perf(junction): use Set for O(1) planned primary lookups
```

### Guidelines

- Use lowercase for type, scope, and description
- Keep description under 72 characters
- Use present tense ("add" not "added")
- Scope should identify the affected module/area
- Reference issues when applicable: `fixes #123`

## API Development

1. Define request/response schemas using Zod
2. Include OpenAPI tags and descriptions in route definitions
3. OpenAPI docs auto-generate during CI build

## Pull Requests

- Describe what changes accomplish
- Link related issues (e.g., "Fixes #123")
- Include screenshots for visual changes
- Update documentation if needed

## Questions?

[Open an issue](https://github.com/jamcalli/pulsarr/issues) with the "question" label.