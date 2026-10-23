# Mailing audience: all Boosty subscribers

The «Рассылки» page offers a fourth audience, «Все подписчики Boosty». It
reaches every address the Boosty subscriber list has ever shown, active or
former, whether or not the person opted in to our letters. The consented
audiences («Все согласившиеся», «Только активные», «Только бывшие») still
need a verified opt-in.

- `mailing_contacts.boosty_seen_at` marks a contact the Boosty list showed.
  It is set when the list is read and never cleared; subscribers the author
  blacklisted on Boosty are not marked. A site reader who later
  appears on Boosty keeps their own consent and gains the mark. Older
  databases get the column at start; contacts the Boosty list created before
  (`consent_source = 'boosty-observed'`) are marked from `first_seen_at`.
- The list (`include_inactive=true`) is read in the background a minute after
  start and every 6 hours when background jobs run, so the audience does not
  depend on someone opening the Boosty admin page.
- The audience drops unsubscribed, suppressed, bounced and blocked addresses
  and placeholder e-mails. The send worker re-checks each delivery against
  its campaign's own segment (`server/mailingAudience.ts`), so an unsubscribe
  between queueing and sending is honoured. Every letter carries the
  personal unsubscribe link and `List-Unsubscribe` header.
- The send confirmation says the audience includes people who never opted in.
