# BookPro Services

Nigeria's first marketplace for customers to book verified skilled professionals, with professional and admin operations.

## Current Architecture

- Static frontend: `index.html`, `styles.css`, `app.js`
- Node HTTP API: `server.js`
- Security helpers: `src/security.js`
- Repository abstraction: `src/repository.js`
- Prisma schema: `prisma/schema.prisma`
- Prisma seed script: `prisma/seed.js`
- Local JSON fallback: `data/store.json`

The API uses Prisma/PostgreSQL when `DATABASE_URL` is configured and `@prisma/client` is installed/generated. Without those dependencies, it falls back to `data/store.json` so the local prototype remains runnable.
