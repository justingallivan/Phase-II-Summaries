#!/usr/bin/env bash
#
# Update the Anthropic balance anchor in .env.local AND on Vercel
# (production + preview + development) after a top-up.
#
# Usage:
#   scripts/update-balance-anchor.sh <cents> [date]
#
# Examples:
#   scripts/update-balance-anchor.sh 10000              # today's date
#   scripts/update-balance-anchor.sh 10000 2026-05-01   # explicit date
#
# <cents> is the TOTAL remaining balance after top-up, in cents
# (e.g. $100 top-up to a $5 balance → 10500).

set -euo pipefail

CENTS="${1:-}"
DATE="${2:-$(date +%Y-%m-%d)}"

if [[ -z "$CENTS" || ! "$CENTS" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <cents> [date]" >&2
  echo "  <cents>  integer — current balance in cents (e.g. 10000 for \$100)" >&2
  echo "  [date]   ISO date (default: today)" >&2
  exit 1
fi

if [[ ! "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Error: date must be YYYY-MM-DD, got '$DATE'" >&2
  exit 1
fi

ENV_FILE=".env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found (run from project root)" >&2
  exit 1
fi

echo "→ Updating $ENV_FILE"
# Replace or append each var. Uncomment commented-out forms too.
for pair in "ANTHROPIC_BALANCE_ANCHOR_CENTS=$CENTS" "ANTHROPIC_BALANCE_ANCHOR_DATE=$DATE"; do
  key="${pair%%=*}"
  if grep -qE "^#?\s*${key}=" "$ENV_FILE"; then
    # macOS sed + GNU sed compatible
    sed -i.bak -E "s|^#?\s*${key}=.*|${pair}|" "$ENV_FILE" && rm "${ENV_FILE}.bak"
  else
    echo "$pair" >> "$ENV_FILE"
  fi
done

echo "→ Pushing to Vercel (production + preview + development)"
for env in production preview development; do
  for key in ANTHROPIC_BALANCE_ANCHOR_CENTS ANTHROPIC_BALANCE_ANCHOR_DATE; do
    # rm returns non-zero if var doesn't exist yet; that's fine
    vercel env rm "$key" "$env" --yes >/dev/null 2>&1 || true
  done
  printf '%s' "$CENTS" | vercel env add ANTHROPIC_BALANCE_ANCHOR_CENTS "$env" >/dev/null
  printf '%s' "$DATE"  | vercel env add ANTHROPIC_BALANCE_ANCHOR_DATE  "$env" >/dev/null
  echo "  ✓ $env"
done

echo
echo "Done. Anchor: $CENTS cents as of $DATE."
echo "Restart your dev server to pick up the local change."
