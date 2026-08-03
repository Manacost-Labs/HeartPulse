# Client interface incidents

The root and recoverable React error boundaries send bounded diagnostic reports
to `POST /api/telemetry/client-errors`. The report contains the public release
SHA, pathname, error type/message, JavaScript stack and React component stack.

The endpoint rejects malformed incident IDs and releases, strips query strings,
redacts URLs and email addresses, limits every field and never records cookies,
headers, IP addresses or user identifiers. A diagnostics failure still returns
`204`, so reporting cannot turn a recovered browser failure into another outage.

Production writes one structured line per incident with the stable prefix
`[client-interface-error]`. Search the application journal by the UUID shown to
the user:

```bash
journalctl -u hs-arena --since today | grep 'INCIDENT_UUID'
```

Use the `releaseId`, `route`, `message` and `componentStack` fields to identify
the failing build and component. Never ask a user to send cookies or session
data; the displayed UUID is sufficient after this telemetry endpoint is live.
