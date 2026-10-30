#!/bin/bash
# Builds test/native/core_test.cc with src/core under a sanitizer and runs it.
# Usage: test/native/run.sh thread|address [threads] [iterations]
#   thread   ThreadSanitizer: data races in this package's code. libxml2 and libxslt aren't
#            instrumented, so races inside them aren't seen; their locks are.
#   address  AddressSanitizer, UndefinedBehaviorSanitizer and LeakSanitizer, with ASan-built
#            libxml2 and libxslt when available
set -euo pipefail
cd "$(dirname "$0")/../.."

case "${1:-}" in
	thread)
		flags=(-fsanitize=thread)
		export TSAN_OPTIONS="halt_on_error=1"
		;;
	address)
		flags=(-fsanitize=address,undefined -fno-sanitize-recover=undefined)
		# Use the ASan-instrumented libxml2 and libxslt when the image has them (docker/test.Dockerfile, asan)
		if [ -d /opt/asan/lib/pkgconfig ]; then
			export PKG_CONFIG_PATH=/opt/asan/lib/pkgconfig
			flags+=(-Wl,-rpath,/opt/asan/lib)
		fi
		export ASAN_OPTIONS="detect_leaks=1:abort_on_error=1"
		export UBSAN_OPTIONS="print_stacktrace=1:halt_on_error=1"
		;;
	*)
		echo "Usage: $0 thread|address [threads] [iterations]" >&2
		exit 2
		;;
esac

mkdir -p build
binary="build/core_test_$1"
g++ -std=c++17 -g -O1 -fno-omit-frame-pointer -pthread "${flags[@]}" \
	src/core/*.cc test/native/core_test.cc \
	$(pkg-config --cflags --libs libxml-2.0 libxslt libexslt) -o "$binary"
"$binary" "${@:2}"
