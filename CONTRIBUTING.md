# Contributing to TestPilot AI

Thanks for taking the time to improve TestPilot AI. This document covers how to set up
the project, the checks a change has to pass, and what a good pull request looks like.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search the existing issues and pull requests first — someone may already be working
  on the same thing.
- For anything larger than a bug fix (new check types, schema changes, new endpoints),
  open an issue describing the design before writing code, so the approach can be
  agreed on before review time is spent.
- Never open a public issue for a security problem. Follow [SECURITY.md](SECURITY.md)
  instead.

## Project layout

| Path | What lives there |
| --- | --- |
| `backend/app/` | FastAPI application: API routes, SQLite access, Playwright runner, analyzers, exports |
| `backend/tests/` | Pytest suite (API, database, runner, security, reporting) |
| `frontend/src/` | React + TypeScript client (Vite, Tailwind) |
| `frontend/src/test/` | Vitest + Testing Library suite |
| `test-sites/fixtures/local_test_site/` | Deliberately imperfect fixture website used by tests |
| `docs/` | Screenshots referenced by the README |

## Development setup

Requirements: Python 3.11+, Node.js 20+, and a Chromium install for Playwright.

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
playwright install chromium
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` to `http://127.0.0.1:8000`, so start the backend first.

### Fixture website

Tests and manual smoke runs use a local fixture site instead of the public internet:

```bash
cd test-sites/fixtures/local_test_site
python server.py --port 8099
```

Local targets are blocked by the SSRF policy unless the server is started with
`TESTPILOT_ALLOW_LOCAL_TARGETS=true`. Keep that flag out of any production deployment.

## Checks before opening a pull request

Run the same commands CI runs. A pull request that fails any of them will not be merged.

```bash
# Backend
cd backend
ruff check app tests
ruff format --check app tests
pytest

# Frontend
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
```

There is no coverage threshold and no snapshot testing — add a focused test when you
change behaviour, and keep existing tests meaningful rather than loosening assertions to
make them pass.

## Code style

- **Python:** Ruff with the repository configuration. Type hints on public functions.
  No new runtime dependency without a reason in the pull request.
- **TypeScript:** strict mode, function components with hooks, no `any` without a
  comment explaining why. Tailwind utilities + the primitives in
  `frontend/src/components/ui.tsx` instead of one-off component libraries.
- **Copy:** describe what the software actually did. Do not add placeholder statistics,
  fabricated demo links, or "coming soon" UI that pretends to work.
- **Security:** every outbound request goes through the existing SSRF guard; never add
  a path that fetches a user-supplied URL directly.

## Commit messages

Conventional Commits, one logical change per commit:

```
feat: add accessibility checks to the runner
fix: keep skipped checks out of the failed count
docs: document the AI provider fallback
test: cover redirect limits in the SSRF guard
chore: bump Playwright to the current release
```

Reference an issue in the body when one exists (`Refs #12`).

## Pull requests

The template asks for a summary, the type of change, and how it was verified. Please:

1. Keep the change scoped — unrelated refactors belong in their own pull request.
2. Describe verification honestly, including what you could not run.
3. Update `README.md` when behaviour, configuration, or endpoints change.
4. Never commit secrets, `.env` files, database files, screenshots from real runs, or
   build output — `.gitignore` covers these, but check `git diff` before pushing.

## Releases

The project is not published to a package registry. Tags follow semantic versioning
(`v1.2.0`) and the deploy workflow only runs from `main` after CI is green.
