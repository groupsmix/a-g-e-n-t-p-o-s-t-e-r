# Database Migrations Guardrail

## Important Naming Rule
Migrations are tracked in production by their exact filenames in the `d1_migrations` table. 

**DO NOT RENAME OR DELETE ALREADY-APPLIED MIGRATIONS.**

Specifically:
- `011a_product_deliverable.sql`
- `014a_learning_loop.sql`

These are intentionally interleaved and already-applied. Renaming or renumbering them will cause migrations to fail on deploy because Cloudflare D1 tracks migrations strictly by filename.

To rollback or alter a schema, always create a **new** sequential migration file with a forward increment (e.g., `019_some_change.sql`). Never edit or rename historical migrations.
