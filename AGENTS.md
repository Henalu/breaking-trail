# Codex Instructions

## Source of Truth

Read `CLAUDE.md` before starting any task in this project. It is the authoritative project brief for architecture, workflow, design direction, roadmap, and guardrails.

This file only adapts that brief to Codex.

## Codex Skill Routing

- Treat the `Comandos Impeccable — Cuándo Ejecutar` section in `CLAUDE.md` as active for Codex too. Use the matching installed Codex skills proactively when their trigger condition is met.
- Treat the `Agentes Disponibles — Cuándo Activar Cada Uno` section in `CLAUDE.md` as active for Codex too. Use the matching installed Codex skills with the same slug shown there.
- Apply these skills autonomously when the match is clear. Do not wait for an explicit request if `CLAUDE.md` already defines that step as part of the normal workflow.

## Priority

If anything here and `CLAUDE.md` differ, follow `CLAUDE.md` and use this file only as the Codex translation layer.
