# Arena legendary groups

`/legendaries/` shows groups of first-pick legendary cards for Arena. Each
group has a key legendary, optional companion cards, overall metrics and
optional class-specific metrics. The class filter includes neutral groups.
Users can switch between HSReplay and Firestone, sort the groups, and search
card names. The Express `/api/legendaries` response remains the data source.

The page requires the Arena subscription entitlement. Anonymous HTML may
contain its description and access gate, but must not contain private group
statistics. Client requests must wait for a verified account and entitlement;
data from one account must never remain visible after an account change.

The shared TypeScript contract is owned by `src/modules/arenaLegendaries`.
Its browser client validates protected responses, scopes its six-hour cache by
account and source, refreshes with ETags, clears the cache after an access
denial, and shows a stale snapshot only for the same account during a transient
failure. A 304 response without a usable cache triggers an unconditional retry.
The production HTML route remains on the legacy renderer until Next.js direct
port, browser and Nginx cutover checks pass.
