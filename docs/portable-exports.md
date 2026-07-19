# Portable exports

A Fellowship42 portable export is a sensitive, provider-neutral directory that
can be verified with the public `f42ctl` tool while disconnected from
Fellowship42 Cloud. It is an ownership artifact, not a Cloudflare backup and not
a control-plane payload.

The first format deliberately separates collection from assembly. Cloudflare
documents a full D1 schema-and-data export through `wrangler d1 export`; R2
objects can be listed and streamed through a bucket binding or the standard S3
API. `f42ctl` accepts the resulting local inputs without needing long-lived
Cloudflare credentials itself.

## Consistency boundary

Version 1 requires `operator-quiesced` consistency. Before collection, an
operator must stop church writes and background delivery, record the quiesce
timestamp, then collect D1 and R2 before allowing writes again. The CLI will not
label an ordinary hot copy as consistent. Cloudflare notes that a D1 export
blocks database requests while it runs, but that does not make a separate R2
capture part of the same transaction.

## Collect and assemble

1. Put the instance into an operator-observed read-only/quiesced state.
2. Export the complete D1 schema and data to a new local file. For a remote
   database, the underlying supported command is:

   ```bash
   pnpm wrangler d1 export <database-name> \
     --remote \
     --output ./database.sql
   ```

3. Stream every authorized R2 object into a local source directory and create
   a strict collector index:

   ```json
   {
     "formatVersion": 1,
     "objects": [
       { "key": "sermons/example.mp3", "file": "objects/example.mp3" }
     ]
   }
   ```

4. Assemble a new export directory:

   ```bash
   pnpm f42ctl export \
     --manifest ./deployment-manifest.json \
     --d1 ./database.sql \
     --r2-index ./r2-source.json \
     --r2-root ./r2-capture \
     --directory ./church-export \
     --quiesced-at 2026-07-19T21:00:00.000Z
   ```

The output directory must not already exist. It contains:

```text
church-export/
├── export-manifest.json
├── config/portable.json
├── d1/database.sql
└── r2/
    ├── index.json
    └── objects/<sha256>
```

R2 bytes are content-addressed, so identical objects are stored once. The R2
index retains the original object keys inside the sensitive bundle. The
portable configuration contains only application settings currently safe to
move; it excludes Access configuration, domains, resource names, account IDs,
and secrets.

## Verify offline

```bash
pnpm f42ctl verify-export --directory ./church-export
```

Verification rejects malformed contracts, mismatched identity, timestamps,
sizes or hashes, unsafe paths, links, extra files, duplicate R2 keys, missing
objects, and non-content-addressed objects. Success emits bounded export
evidence containing versions, timestamps, portable instance ID, and the export
manifest digest. It never emits D1 rows, R2 keys, church counts, or object
payloads.

The evidence is safe for an optional management system to retain. The bundle
is not: it can contain member, donor, contribution, and media data and must be
encrypted, access-controlled, retained, and destroyed according to church
policy. Never commit it or include it in logs.

Version 1 proves byte integrity and identity binding. Import, new-resource
binding, credential rotation, cutover, and a full cross-account rehearsal are
separate lifecycle increments.

## Cloudflare references

- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [R2 Workers binding API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [R2 object downloads](https://developers.cloudflare.com/r2/objects/download-objects/)
