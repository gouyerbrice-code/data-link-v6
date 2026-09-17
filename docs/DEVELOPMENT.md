# Development

## Requirements

- Node.js 22+
- npm 10+

## Commands

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run health-check
npm run verify
```

No production deployment is part of P0.

## Environments

Supported configuration names:

- development
- test
- staging
- production

P0 does not configure a production environment.

Secrets belong in runtime environment/secret management, never in source.
