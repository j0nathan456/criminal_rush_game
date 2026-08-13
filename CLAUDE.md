# CLAUDE.md

Guidance for working in the `criminal_rush_game` codebase — a digital version of the Criminal Rush card game, built with React + TypeScript + Vite.

## Architecture

The codebase is organized into three main areas. Keep responsibilities within their area and route all cross-area communication through **setup**.

### 1. Engine (`src/engine/`, `src/hooks/`)
All game logic lives here: game state, turn flow, rules, scoring, and state transitions. The engine is UI-agnostic — it knows nothing about how anything is rendered. It exposes state and actions; it does not import from `constants`.

### 2. Constants (`src/constants/`)
Defines all UI elements and static configuration: roles, card definitions, board setup, labels, colors, and any fixed data the interface renders. Pure data and declarations — no game logic and no engine imports.

### 3. Setup (`src/setup/`)
The interface layer that wires the UI elements (constants) to the engine. It maps engine state and actions onto the constants that the components render, and translates user interactions back into engine actions. This is the only area that depends on both the engine and the constants.

Dependency direction:

```
constants  ─┐
            ├──▶  setup  ──▶  engine
engine     ─┘
```

The engine and constants stay independent of each other; setup is the bridge between them.

## Rules

1. **Always run `npm run test` before handing control back to me.** Do not report a task as done until the tests pass.
2. **Always use TypeScript.** All new code is written in `.ts` / `.tsx`. No plain JavaScript source files.
