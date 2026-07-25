# Reader access modes

Mực defaults to `public`, so a missing environment variable never locks the deployed site unexpectedly.

Configure `MUC_READER_ACCESS_MODE` in Cloudflare Pages:

- `public`: everyone can read.
- `account`: any signed-in account can read.
- `invite`: registration requires `MUC_INVITE_CODE`; signed-in accounts can read.
- `allowlist`: only signed-in usernames in the comma-separated `MUC_READER_ALLOWLIST` can read or register.

The check runs on comic and novel reader pages and on the chapter-content APIs. Secrets are never returned by `/api/reader-access`.

Example:

```text
MUC_READER_ACCESS_MODE=invite
MUC_INVITE_CODE=<long random secret>
```

Access control limits who can use the reader. It does not grant permission to copy a third-party catalog; every content provider still needs a permitted API, compatible license, or explicit authorization.
