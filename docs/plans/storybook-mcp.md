# Storybook and MCP integration

## Objective

Add a development-only component workshop that lets maintainers and AI agents
inspect, document, exercise, and visually review the existing React UI without
starting the production server.

## Stack

- React 19 and TypeScript 5.8
- Vite 6
- Storybook 10 with the React Vite framework
- Official Storybook MCP addon

## Commands

- Development: `npm run storybook`
- Static build: `npm run build-storybook`
- Contract test: `npm run test:storybook`

## Structure

- `.storybook/main.ts` owns framework, addon, story, and static asset discovery.
- `.storybook/preview.tsx` loads the same global styles used by the application.
- Stories remain colocated with their components under `src/`.
- `storybook-static/` is generated output and is not committed.

## Testing strategy

- A Node contract test guards scripts, packages, MCP registration, and addon
  configuration.
- `build-storybook` proves that every discovered story can be compiled.
- The local Storybook and `/mcp` endpoint are checked in a real browser.

## Boundaries

- Always keep Storybook dependencies in `devDependencies`.
- Always serve project assets from `public/` and reuse authored component CSS.
- Never add credentials, remote write access, or production runtime imports.
- Never expose the local MCP endpoint through the production reverse proxy.

## Success criteria

- Storybook starts on port 6006 and its static build succeeds.
- At least one existing Manacost component has documented component states.
- The official MCP addon responds at `http://127.0.0.1:6006/mcp`.
- Storybook compilation and the targeted agent-tooling checks remain green;
  unrelated pre-existing repository-wide type errors are recorded separately.
