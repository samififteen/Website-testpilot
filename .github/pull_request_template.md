## Summary

<!-- What changed and why. Link the issue if one exists: "Closes #12". -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] CI / tooling
- [ ] Security fix

## How it was verified

<!-- Commands you ran and what you saw. Say plainly what you could NOT run. -->

- [ ] Backend: `ruff check app tests`, `ruff format --check app tests`, `pytest`
- [ ] Frontend: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- [ ] Manual check against the fixture site (`test-sites/fixtures/local_test_site`)

## Checklist

- [ ] The change is scoped to one logical change
- [ ] New behaviour has a test, or the reason it cannot be tested is explained
- [ ] `README.md` is updated if configuration, endpoints, or behaviour changed
- [ ] No secrets, `.env` files, database files, or build output are included
- [ ] Fetches of user-supplied URLs still go through the SSRF guard
