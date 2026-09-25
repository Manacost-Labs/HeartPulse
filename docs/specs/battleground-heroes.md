# Battleground heroes access

`/heroes/` publishes its title, description and canonical URL to every visitor.
The detailed tier list continues to use the existing `/api/bg/heroes` client
and requires the `battlegrounds` entitlement. An administrator may use the
same statistics without a separate subscription, matching the Express access
policy. The Next.js page waits for account verification before mounting the
statistics client, so no protected request or data appears in guest HTML.

The Next.js list route is staged while public Nginx traffic remains on the
legacy page. `/heroes/:dbfId/` remains legacy until its public identity,
missing-ID and account data contracts are migrated separately.
