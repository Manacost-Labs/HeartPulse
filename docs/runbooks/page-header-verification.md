# Verify page headers

Run the browser regression from the project root:

```sh
node --test tests/page-headers-browser.test.mjs
```

The fixture loads production CSS, including route overrides, and compares
header width, height, title size, the 16px gap to the next content block, and
clipping across traditional and Arena
surfaces. It also checks reduced motion. It uses synthetic public labels;
it does not authenticate or request paid datasets.

Install the locked dependencies in the isolated worktree with `npm ci`. For
production-size checks, build with `RELEASE_SHA` set to the full commit SHA;
the development placeholder has different compression and cannot certify the
release budget.

Run `npm run qa:ci` before publication to verify the built application, including
shared Arena/editorial banner heights and route canvas padding. These assertions
follow the same responsive header contract as the focused regression.

For a live guest audit, the locally installed Jev pipeline supports:

```sh
jev-audit hearthpulse --mode measure
jev-audit hearthpulse --mode all --diagnostic-network
```

`measure` uses browser measurements without a model request. `all` also uses
TypeSafe Jev through OpenRouter for navigation; its completion is checked
against the scenario's expected route sequence and final visible element.
Secrets stay in the ignored local Jev environment, outside this repository.

Keep paywall screens separate from page-header comparisons. A guest run cannot
verify subscribed Arena content. Diagnostic network overrides must be disclosed;
they do not certify ordinary DNS or analytics availability. Compare the same
viewport, motion preference, loaded fonts and settled geometry. Save the JSON
report and screenshots before deciding whether a regression is resolved.
