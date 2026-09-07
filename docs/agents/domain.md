# Domain Docs

This repository uses a single-context domain-documentation layout.

## Consumer Rules

Before exploring or changing the repository:

1. Read root `CONTEXT.md` when it exists.
2. Read relevant ADRs under `docs/adr/` when that directory exists.
3. Use the vocabulary defined in `CONTEXT.md`.
4. Surface conflicts with existing ADRs instead of silently overriding them.
5. If these files do not exist, proceed silently.

Domain files are created lazily by the domain-modeling workflow when terminology or architectural decisions are resolved.

## Layout

```text
/
|-- CONTEXT.md
|-- docs/
|   `-- adr/
|       |-- 0001-example-decision.md
|       `-- 0002-another-decision.md
`-- ...
```

## Vocabulary

Use domain terms exactly as defined in `CONTEXT.md`. Avoid introducing synonyms for established concepts.

If a required concept is missing, reconsider whether the new term is necessary. Record genuine domain-model gaps for the domain-modeling workflow.

## ADR Conflicts

If proposed work contradicts an ADR, identify the conflict explicitly:

> Contradicts ADR-0007, but may be worth reopening because...
