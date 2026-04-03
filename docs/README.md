# DocFlow — Documentation Index

This folder contains all submission documentation.

| File | Contents |
|------|----------|
| [`api.md`](./api.md) | Full API reference — all endpoints, request/response shapes, auth approach, error codes |
| [`schema.md`](./schema.md) | Database schema — table definitions, ERD, index rationale, key design decisions |
| [`schema.sql`](./schema.sql) | Raw SQL — ready to run against any PostgreSQL 14+ instance |
| [`engineering.md`](./engineering.md) | Engineering notes — architecture, API design decisions, data modeling, search approach, trade-offs, assumptions |

---

## Quick Reference

### Setup
See the root [`README.md`](../README.md) for full setup instructions.

### Run schema manually
If you want to inspect or run the schema independently of the application:
```bash
psql $DATABASE_URL -f docs/schema.sql
```

### API base URL
```
Development: http://localhost:8080/api/v1
Via proxy:   /api/v1  (Next.js rewrites to backend)
```

### Auth
```
POST /api/v1/auth/register   → get token pair
POST /api/v1/auth/login      → get token pair
Authorization: Bearer <access_token>  → required for /admin/* routes
```
