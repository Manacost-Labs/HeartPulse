# Battleground heroes access

`/heroes/` publishes its title, description and canonical URL to every visitor.
The detailed tier list continues to use the existing `/api/bg/heroes` client
and requires the `battlegrounds` entitlement. An administrator may use the
same statistics without a separate subscription, matching the Express access
policy. The Next.js page waits for account verification before mounting the
statistics client, so no protected request or data appears in guest HTML.

The Next.js list route is staged while public Nginx traffic remains on the
legacy page. The `/heroes/:dbfId/` detail route is also staged in Next.js.
Express exposes `/api/bg/heroes/public/:dbfId` as a cacheable anonymous
projection of hero ID, name, image and hero power only. It uses the same solo
and duo catalog resolution as the existing SEO route; missing IDs return 404
and upstream failures return retryable 503. Next.js does not forward account
cookies to this endpoint and returns a real 404 for missing IDs. The full hero
statistics client mounts only after account verification. Public Nginx traffic
continues to use the legacy detail route until deployment checks are complete.
