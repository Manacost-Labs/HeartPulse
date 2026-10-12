# Public help center

`src/modules/helpCenter/public.ts` owns the FAQ content, search matching and
server-compatible presentation. Next composition renders answer JSX on the
server and passes it to a small client explorer for filtering and hash
navigation. All answers remain in initial HTML with native disclosures.

Legacy FAQ content exports delegate to this module. Existing question types
still accept authored items without a permalink ID. The canonical help
content supplies a stable ID for every question.

The help center uses React, lucide-react and shared UI. It has no account
requests, private data or imports from other domain internals. Account views
link through public `/faq/#faq-...` routes. The dependency direction remains
`app -> modules -> shared`.

See [help center contract](../specs/help-center.md) and
[module boundaries](module-boundaries.md).
