# Registration Patterns by Ecosystem

Common registration pipelines where adding a new entity requires coordinated
changes across multiple files. Use as detection heuristics — not every project
follows these, but they indicate where to look.

## JavaScript / TypeScript

### Express / Fastify / Hono
- Route handler + route index/barrel + middleware chain + OpenAPI/schema
- Controller + service + repository (layered architecture)
- Middleware: file + app.use() registration + type declarations

### React
- Component file + route definition + navigation menu + lazy import
- Context provider + provider tree wrapper + consumer hooks
- Redux/Zustand: slice/store + root store config + root reducer

### Next.js / Remix
- Page/route file + layout + navigation + middleware + API route
- Server action + form component + validation schema

### Tool / Plugin Systems (CLIs, bots, VS Code extensions)
- Plugin file + plugin registry/index + config schema + permissions/tiers
- Command definition + command router + help text + display names

### Monorepos
- Package directory + workspace config (pnpm-workspace.yaml, turborepo.json)
- Shared types package + consumers that import from it

## Python

### Django
- Model + migration + admin registration + serializer + URL conf + view
- Management command + tests + documentation
- Signal handler + connection in apps.py or signals.py

### FastAPI / Flask
- Route/view + router inclusion + schema/model + dependency injection
- Background task + Celery task registration + periodic schedule

### Package Distribution
- Module + __init__.py exports + pyproject.toml entry points

## Go
- Handler + route registration (mux/router) + middleware chain
- Interface + implementation + wire/DI registration
- Proto definition + generated code + server registration

## Rust
- Module file + mod.rs declaration + lib.rs re-export
- Trait implementation + registration in builder/config
- Migration file + migration runner registration

## Cross-Language Patterns

### Configuration
- Feature flag: code check + config file + documentation + tests
- Environment variable: code reference + .env.example + docs + validation

### Infrastructure
- API endpoint: handler + route + schema/types + tests + documentation
- Database entity: migration + model/ORM + repository + seed data
- Message/event: producer + consumer + schema + dead-letter handling

### CI/CD
- New service/package: build config + test config + deploy config + monitoring

## Detection Heuristics

When you can't identify a project's ecosystem, look for these universal signals:

1. **Barrel/index files** (`index.ts`, `__init__.py`, `mod.rs`) that re-export
2. **Arrays or maps in config** that list "all the X" (routes, plugins, tools)
3. **Decorator/annotation patterns** that register at import time
4. **Code generation** that reads a schema and produces multiple files
5. **Test discovery** that relies on naming conventions or explicit config
6. **Display name maps** — UI labels for internal identifiers (often forgotten)
7. **Permission/tier definitions** — security registries for new capabilities
