#!/bin/bash
# Forgepress Acceptance Tests
set -o pipefail

PASS=0
FAIL=0

check() {
    if eval "$1" 2>/dev/null; then
        echo "  PASS: $2"
        ((PASS++))
    else
        echo "  FAIL: $2"
        ((FAIL++))
    fi
}

echo "=== Forgepress Acceptance Tests ==="

# Build
node src/cli.js build --config ./forgepress.config.js 2>/dev/null

check 'test -d ./dist' "Output directory exists"
check 'test -f ./dist/index.html' "index.html generated"
check 'test -f ./dist/about.html' "about.html generated"
check 'test -f ./dist/blog/first-post.html' "first-post.html generated"
check 'test ! -f ./dist/drafts/unpublished.html' "Draft post excluded"
check 'grep -q "<title>Welcome to Forgepress" ./dist/index.html' "Title in template"
check 'grep -q "<h2" ./dist/index.html' "Headings rendered"
check 'grep -q "<strong>" ./dist/index.html' "Bold text rendered"
check 'grep -q "hljs" ./dist/index.html' "Syntax highlighting applied"
check 'grep -q "toc" ./dist/index.html' "Table of contents generated"
check 'grep -q "min read" ./dist/index.html' "Reading time calculated"
check 'grep -q "og:title" ./dist/index.html' "SEO meta tags injected"
check 'grep -q "<table>" ./dist/blog/first-post.html' "GFM tables rendered"
check 'grep -q "href=\"/about.html\"" ./dist/index.html' "Navigation partial rendered"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
