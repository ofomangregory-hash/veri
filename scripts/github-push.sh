#!/bin/bash
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN environment variable is not set." >&2
  echo "Add it as a Replit secret (classic PAT with repo scope)." >&2
  exit 1
fi

REPO="ofomangregory-hash/Character-Catalog-Creator"
BRANCH="${1:-main}"

GIT_ASKPASS='' \
GIT_TERMINAL_PROMPT=0 \
GIT_LFS_SKIP_PUSH=1 \
git -c credential.helper='' \
    -c lfs.https://github.com/${REPO}.git/info/lfs.locksverify=false \
    push "https://${GITHUB_TOKEN}@github.com/${REPO}" "$BRANCH"

echo "Pushed branch '$BRANCH' to GitHub successfully."
