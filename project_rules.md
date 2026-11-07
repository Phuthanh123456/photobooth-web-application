# Project rules

- Scope is M0 and M1 only. Real Nikon integration requires approval.
- Exactly four photos; each shutter follows a full 10,000 ms server-monotonic countdown.
- Only the backend advances state. Browsers render server seconds/deadlines.
- Never overlap captures or automatically retry an uncertain shutter command.
- Save confirmation, file verification and camera readiness precede the next countdown.
- Errors stop the session; operator must acknowledge/reset before starting a new session.
- Cancellation stops future shutters; an in-flight operation must settle before reuse.
- Session IDs are UUIDs. Each session has an isolated directory and four manifest records.
- The iPad route and its WebSocket connection have no control capability.
- Keep SDK binaries/licenses and generated photos out of Git.
