#!/bin/bash
# Memory and thread safety checks, in Docker (Node 24):
#   1. the test suite with the addon, libxml2 and libxslt built with AddressSanitizer (and the
#      addon with UndefinedBehaviorSanitizer)
#   2. src/core from 8 threads under ThreadSanitizer
#   3. the same under AddressSanitizer and LeakSanitizer
#   4. a memory growth check over 500,000 calls (about 2 minutes)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building the sanitizer image"
docker build -q -f docker/test.Dockerfile --target asan -t node-libxslt-test:asan . > /dev/null
echo "==> Test suite under AddressSanitizer"
docker run --rm node-libxslt-test:asan
echo "==> src/core under ThreadSanitizer"
docker run --rm node-libxslt-test:asan bash test/native/run.sh thread 8 100
echo "==> src/core under AddressSanitizer and LeakSanitizer"
docker run --rm node-libxslt-test:asan bash test/native/run.sh address 8 100
echo "==> Memory growth"
docker build -q -f docker/test.Dockerfile --target full -t node-libxslt-test:node24-full . > /dev/null
docker run --rm node-libxslt-test:node24-full node --expose-gc test/leak/rss.js
