# TASK-<id> — <short title>

## Objective
What outcome this task produces, in one or two sentences.

## Requirements
What must be true when this is done. Bullet points, not prose.

## Acceptance criteria
How you'll know it's actually done — specific, checkable.

## Affected systems
`backend` / `admin` / `mobile` — which ones, and why each is touched.

## Affected modules
Point at `system-design/04-where-do-i-change-things.md` entries or specific
folders/files, not vague areas.

## API changes
New/changed endpoints. Update `api/*.md` as part of this task if so — don't leave it
for later.

## Database changes
New migration(s), or "none."

## UI changes
Mobile screens / admin pages affected, or "none."

## Dependencies
Anything this task needs first (another task, a decision in `open-questions.md`, an
external account/credential).

## Risks
What could go wrong, and what happens if it does.

## Testing requirements
What must be checked before calling this done — compile/typecheck/lint, and where
possible, actually exercising the feature (curl the endpoint, run on the emulator) —
see `AI_RULES.md` §5.

## Allowed files / areas
What this task may touch. Keep it narrow.

## Out of scope
What this task explicitly does not do, so it doesn't grow while being implemented.

## Implementation status
`Not started` / `In progress` / `Done` — and if done, a link to the `reports/<NN-topic>/`
writeup that documents what actually shipped and what was verified.
