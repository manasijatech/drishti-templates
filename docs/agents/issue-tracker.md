# Issue Tracker: GitHub

Issues and specifications for this repository live in GitHub Issues. Use the `gh` CLI for all operations.

## Repository

Infer the repository from the configured GitHub remote. When run from this checkout, `gh` targets `manasijatech/drishti-templates`.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Add a label: `gh issue edit <number> --add-label "..."`
- Remove a label: `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number> --comment "..."`
- Use temporary body files for long or structured issue content.

## Pull Requests As A Request Surface

PRs as a request surface: no.

GitHub shares one number space across issues and pull requests. If a reference such as `#42` is ambiguous, try `gh pr view 42` and then `gh issue view 42`.

## Skill Operations

When a skill says "publish to the issue tracker," create a GitHub issue.

When a skill says "fetch the relevant ticket," run:

`gh issue view <number> --comments`

## Wayfinding

A wayfinding map is one GitHub issue with linked child issues.

- Label the map `wayfinder:map`.
- Label child tickets with the applicable `wayfinder:<type>` label.
- Use GitHub sub-issues and native dependencies when available.
- If native relationships are unavailable, record `Part of #<map>` and `Blocked by: #<issue>` in issue bodies.
- Claim work with `gh issue edit <number> --add-assignee @me`.
- Resolve work by adding the result as a comment and closing the issue.
