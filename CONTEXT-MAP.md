# Context Map

## Contexts

- [Finance analysis](./src/core/finance/CONTEXT.md) — owns bank-statement facts, spending taxonomy, and report calculations.
- [Dashboard presentation](./frontend/CONTEXT.md) — presents the finance read model and lets people explore timeframes and cost levers.

## Relationships

- **Finance analysis → Dashboard presentation**: Finance analysis publishes a read-only dashboard snapshot containing scoped totals, category definitions, shares, and monthly/yearly evolution. The presentation context does not reclassify transactions.
