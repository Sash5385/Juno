---
name: model-routing
description: Choose the cheapest model that can do each piece of work. Use at the start of a task, or when a request has easy and hard parts. Routes simple lookups to haiku, medium work to sonnet, and hard work to the session model.
---

# Model routing

Goal: spend less without losing quality. Pick the tier by the work, not by length.

## Tiers

- **simple → haiku**: explain or look up a fact, rename, typo, format, list files, summarize a short text, commit message, translate a short phrase.
- **medium → sonnet**: a small change in one or two files, write a test for existing code, a clear bug with a known cause, a simple form or query.
- **complex → session model (opus)**: refactor across files, architecture or design, migration, security, concurrency, performance, anything with unclear scope or many steps.

If unsure between two tiers, take the higher one. A wrong cheap answer costs more than the saving.

## How to apply

1. Before starting, split the request into parts and tag each part with a tier.
2. Do the complex part yourself.
3. For simple, self-contained parts (search, read a file, summarize output), delegate with the Agent tool and `model: "haiku"`. Give it exact paths and ask for a short result (file:line plus a summary of at most 10 lines).
4. For medium parts, use `model: "sonnet"` the same way, or do them yourself if delegation adds more overhead than it saves.
5. Do not delegate work that needs the conversation's context or that edits files in parallel with other edits.

## Rules

- Keep delegated prompts self-contained: the subagent sees nothing else.
- Do not spawn an agent for one grep or one small file read. Do it directly.
- Say in one line which tier you chose and why, only when the choice changes the approach.
