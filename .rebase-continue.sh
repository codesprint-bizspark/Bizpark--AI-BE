#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
CANONICAL_MAIN="$(pwd)/.rebase-main.ts"
ROOT="$(pwd)"
CANONICAL_MAIN="$ROOT/.rebase-main.ts"

keep_both_sides() {
  python3 - "$1" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path).read()
pattern = re.compile(
    r'    re.DOTALL,
)
<<<<<<< HEAD
def repl(m):
    head, incoming = m.group(1).rstrip("\n"), m.group(2).rstrip("\n")
    parts = [p for p in (head, incoming) if p.strip()]
    return "\n".join(parts) + ("\n" if parts else "")
new = pattern.sub(repl, text)
if new != text:
    open(path, "w").write(new)
    print(f"fixed: {path}")
PY
}

auto_fix() {
  if [[ -f Bizpark.API/src/main.ts ]] && grep -q '^<<<<<<< ' Bizpark.API/src/main.ts; then
    cp "$CANONICAL_MAIN" Bizpark.API/src/main.ts
    echo "fixed: main.ts"
  fi
  for f in $(git diff --name-only --diff-filter=U 2>/dev/null); do
    [[ -f "$f" ]] && grep -q '^<<<<<<< ' "$f" && keep_both_sides "$f"
  done
  if [[ -f Bizpark.API/package-lock.json ]] && grep -q '^<<<<<<< ' Bizpark.API/package-lock.json; then
    keep_both_sides Bizpark.API/package-lock.json
fix_lockfile() {
  local f="Bizpark.API/package-lock.json"
  if [[ -f "$f" ]] && grep -q '^<<<<<<< ' "$f"; then
    keep_both_sides "$f"
    (cd Bizpark.API && npm install --package-lock-only) || true
  fi
}

round=0
while [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; do
  round=$((round + 1))
  (( round > 20 )) && { git status; exit 1; }
  if git diff --name-only --diff-filter=U 2>/dev/null | grep -q .; then
    auto_fix
    git add -A
    git diff --name-only --diff-filter=U 2>/dev/null | grep -q . && { git status; exit 1; }
  fi
  GIT_EDITOR=true git rebase --continue || true
  [[ -d .git/rebase-merge || -d .git/rebase-apply ]] || break
done
git status
grep -rq '^<<<<<<< ' . 2>/dev/null && { echo "Conflict markers remain"; exit 1; } || true
echo "Done"
auto_fix() {
  if [[ -f Bizpark.API/src/main.ts ]] && grep -q '^<<<<<<< ' Bizpark.API/src/main.ts; then
    cp "$CANONICAL_MAIN" Bizpark.API/src/main.ts
    echo "fixed: Bizpark.API/src/main.ts (canonical)"
  fi
  for f in Bizpark.API/src/app.module.ts Bizpark.API/package.json; do
    [[ -f "$f" ]] && grep -q '^<<<<<<< ' "$f" && keep_both_sides "$f" && echo "fixed: $f (keep both)"
  done
  fix_lockfile
  while IFS= read -r f; do
    [[ -n "$f" ]] && keep_both_sides "$f" && echo "fixed: $f (keep both)"
  done < <(git diff --name-only --diff-filter=U 2>/dev/null || true)
}

round=0
max_rounds=60
while [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; do
  round=$((round + 1))
  if (( round > max_rounds )); then
    echo "Stopped after $max_rounds rounds"
    git status
    exit 1
  fi

  if git diff --name-only --diff-filter=U 2>/dev/null | grep -q .; then
    echo "=== Round $round: resolving conflicts ==="
    auto_fix
    git add -A
    if git diff --name-only --diff-filter=U 2>/dev/null | grep -q .; then
      echo "Unresolved files remain:"
      git diff --name-only --diff-filter=U
      exit 1
    fi
  fi

  echo "=== Round $round: git rebase --continue ==="
  if GIT_EDITOR=true git rebase --continue; then
    echo "Rebase step OK"
  else
    code=$?
    if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
      if git diff --name-only --diff-filter=U 2>/dev/null | grep -q .; then
        continue
      fi
      echo "rebase --continue failed ($code) but no unmerged files"
      git status
      exit 1
    fi
    break
  fi
done

if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
  echo "Rebase still in progress"
  git status
  exit 1
fi

echo "Rebase completed successfully"
git status
