#!/usr/bin/env bash
# Copy the dashboard and the latest summary into the blog checkout.
# The blog serves public/ as-is: the page is /school-meals/dashboard/ and reads
# ../data/summary.json, the same layout as this repo. Commit and PR in the blog.
# ponytail: each refresh commits the whole summary (3.6 MB raw) to the blog's
# git, but git stores it as a delta: measured 2026-10-27, one refresh added
# 52 KB packed (about 12 MB a school year if daily). Deleting old copies
# doesn't help (history keeps them); if it ever gets heavy, fetch at build
# time or use a blob store.
# Usage: scripts/publish-blog.sh BLOG_CHECKOUT   (DATA_DIR overrides ./data)
set -euo pipefail
[[ -f "${1:?usage: scripts/publish-blog.sh BLOG_CHECKOUT}/astro.config.mjs" ]] ||
  { echo "not the blog checkout: $1" >&2; exit 2; }
out="$1/public/school-meals"
cd "$(dirname "$0")/.."
mkdir -p "$out/data"
rsync -a --delete dashboard/ "$out/dashboard/"
cp "${DATA_DIR:-data}/summary.json" "$out/data/summary.json"
echo "copied dashboard + summary ($(date -r "$out/data/summary.json" +%F)) to $out"
