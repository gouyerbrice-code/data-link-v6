# Contributing

## P0 rule

Keep changes small, isolated and testable.

Do not add business logic to P0. New capabilities belong to their planned phase.

## Boundaries

- API handles transport.
- Core owns stable technical contracts.
- Future application/domain modules own business behavior.
- Infrastructure adapters will be introduced only when their phase is authorized.

Do not import V5 runtime code into V6.
