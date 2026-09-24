# Public gallery page

`GET /gallery/` is a public, indexable Next.js page. `/gallery` keeps the
existing permanent slash redirect. The page renders the current anonymous
`GET /api/gallery` response at request time; an upstream failure is an error,
not an empty successful gallery. No session data or editor fields enter the
server-rendered HTML.

The page retains the existing gallery cards, full-size viewer and download
action. Express continues to own `/api/gallery` and its image and download
URLs. The client uses those same-origin URLs and does not make a second gallery
list request during hydration.

The canonical URL is `https://hearthpulse.net/gallery/`. Title, description,
robots and Open Graph/Twitter previews match the legacy page. Next HTML errors
receive `X-Robots-Tag: noindex, nofollow` at the Nginx edge. Other editorial
routes remain on their current owner until individually migrated.

The integration contract is checked by `npm run test:next-pilot` and
`npm run test:nginx-routing`; browser review covers card imagery, viewer,
desktop and narrow mobile layouts.
