# Motion kit: direct primitive imports

- Files: `motion-kit/PageTransition.tsx`, `motion-kit/profile.ts`
- Change: import `../primitives/utils` and `../primitives/spring` instead of
  the `../primitives` barrel.
- Why: the barrel pulls its other modules (and `ModalLayer.css`) into every
  page chunk that uses a transition.
- Upstream: not submitted; carry it over when the file is re-copied from the registry.
