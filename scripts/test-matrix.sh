#!/bin/bash
# Builds and tests the addon in Docker for every supported Node version and image variant.
# Usage: scripts/test-matrix.sh [-- <command to run instead of npm test>]
#   NODE_VERSIONS="22 24 26" TARGETS="full runtime alpine" scripts/test-matrix.sh
#   scripts/test-matrix.sh -- npx mocha test/addon.test.js
#   PARITY_PRIVATE_DIR=../test-cases scripts/test-matrix.sh   (also runs the private parity corpus)
set -u
cd "$(dirname "$0")/.."

NODE_VERSIONS=${NODE_VERSIONS:-"22 24 26"}
TARGETS=${TARGETS:-"full runtime alpine"}
[ "${1:-}" = "--" ] && shift
LOG_DIR=${LOG_DIR:-build/test-matrix}
mkdir -p "$LOG_DIR"

# Optional private parity corpus (kept outside the repository), mounted read-only
private_args=()
if [ -n "${PARITY_PRIVATE_DIR:-}" ]; then
	private_args=(-v "$(cd "$PARITY_PRIVATE_DIR" && pwd)":/private:ro -e PARITY_PRIVATE_DIR=/private)
fi

results=()
failed=0
for node in $NODE_VERSIONS; do
	for target in $TARGETS; do
		tag="node-libxslt-test:node$node-$target"
		log="$LOG_DIR/node$node-$target.log"
		echo "==> Node $node ($target)"
		if ! docker build -q -f docker/test.Dockerfile --build-arg NODE_VERSION="$node" --target "$target" -t "$tag" . > "$log" 2>&1; then
			results+=("Node $node $target: BUILD FAILED (see $log)")
			failed=1
			continue
		fi
		if docker run --rm "${private_args[@]}" "$tag" "$@" >> "$log" 2>&1; then
			results+=("Node $node $target: passed")
		else
			results+=("Node $node $target: TESTS FAILED (see $log)")
			failed=1
		fi
		grep -E "^\s+[0-9]+ (passing|failing|pending)" "$log" | sed 's/^/    /'
	done
done

echo
printf '%s\n' "${results[@]}"
exit $failed
