## Summary

<!-- Describe the changes in this PR -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactoring / code quality
- [ ] Documentation
- [ ] CI/CD changes

## Testing

- [ ] TypeScript type checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Tests pass (`pnpm test`)

## SQL Security Checklist

For any changes involving database queries:

- [ ] All user-supplied values use `.bind()` with `?` placeholders — no string concatenation
- [ ] Dynamic column names (if any) are validated against a strict allowlist before interpolation
- [ ] Input is validated/sanitized before passing to parameterized query bindings
- [ ] No raw user input appears in SQL query strings

## Code Quality Checklist

- [ ] No `as any` type casts introduced — proper interfaces used instead
- [ ] Errors are logged with context before returning fallback values
- [ ] New log statements use the structured logger (`@nexus/logger`), not `console.log`
- [ ] New environment URLs use environment variables, not hardcoded values
