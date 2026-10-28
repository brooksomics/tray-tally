#!/usr/bin/env bash
# pre-push: scan the history of every local branch and tag (plus the pushed
# ref) for secrets and for private terms from the untracked local denylist.
# Whole history, not just new commits: a secret added then deleted still ships.
# prek only passes the first ref of a multi-ref push, so don't trust it alone.
# Denylist: one term per line, case-insensitive substring; # lines are comments.
# Fails closed when it has no terms (missing, blank, all comments: new clone).
# ponytail: rescans all history each push; limit to new commits if it gets slow.
set -euo pipefail

denylist="$(git rev-parse --git-path info/privacy-denylist)"
terms="$(sed 's/^[[:space:]]*//; s/[[:space:]]*$//' "$denylist" 2>/dev/null | grep -v -e '^$' -e '^#' || true)"
if [ -z "$terms" ]; then
  echo "push blocked: $denylist is missing or has no terms (only blank or # lines)." >&2
  echo "Create it with one private term per line (names etc.). It is untracked by design." >&2
  exit 1
fi

refs=("${PRE_COMMIT_TO_REF:-HEAD}" --branches --tags)
# Message bodies + patches (author lines left out on purpose), plus annotated
# tag messages. --text etc. stop binary / -diff / textconv files hiding as
# "Binary files differ"; quotePath=false keeps non-ASCII filenames greppable.
history="$(git -c core.quotePath=false log -p --cc --text --no-textconv --no-ext-diff \
  --format=%B "${refs[@]}" | tr -d '\0')"
history+=$'\n'"$(git for-each-ref refs/tags --format='%(contents)')"

gitleaks stdin --no-banner --redact <<<"$history"
if grep -n -i -F -e "$terms" <<<"$history" >&2; then
  echo "push blocked: a term from $denylist appears in the history above." >&2
  exit 1
fi
