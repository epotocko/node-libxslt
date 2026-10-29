# Builds and tests the addon against the system libxml2/libxslt of the Debian Node images.
#   full:    node:<v> image, which already ships the -dev packages
#   build:   node:<v>-slim plus the build toolchain and -dev packages
#   runtime: node:<v>-slim with only the runtime libraries, running the binary from build
# Usage: docker build -f docker/test.Dockerfile --build-arg NODE_VERSION=24 --target runtime .
ARG NODE_VERSION=24

FROM node:${NODE_VERSION} AS full
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY binding.gyp ./
COPY src ./src
RUN npm run build
COPY . .
CMD ["npm", "test"]

FROM node:${NODE_VERSION}-slim AS build
RUN apt-get update && \
	apt-get install -y --no-install-recommends python3 make g++ pkg-config libxml2-dev libxslt1-dev && \
	rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY binding.gyp ./
COPY src ./src
RUN npm run build
COPY . .
CMD ["npm", "test"]

FROM node:${NODE_VERSION}-slim AS runtime
RUN apt-get update && \
	apt-get install -y --no-install-recommends libxml2 libxslt1.1 && \
	rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY --from=build /src ./
CMD ["npm", "test"]

# The addon built with AddressSanitizer and UndefinedBehaviorSanitizer, against libxml2 and
# libxslt built from source with AddressSanitizer too, so that bad memory accesses inside the
# libraries are caught as well (they found a use-after-free the uninstrumented build missed).
# Same versions as the Debian packages. Node isn't instrumented, so the ASan runtime is preloaded;
# leak detection is left to the core tests (test/native), since Node never frees some memory.
FROM node:${NODE_VERSION} AS asan
ARG LIBXML2_VERSION=2.9.14
ARG LIBXML2_SHA256=60d74a257d1ccec0475e749cba2f21559e48139efba6ff28224357c7c798dfee
ARG LIBXSLT_VERSION=1.1.35
ARG LIBXSLT_SHA256=8247f33e9a872c6ac859aa45018bc4c4d00b97e2feac9eebc10c93ce1f34dd79
WORKDIR /tmp/libs
RUN curl -fsSLO https://download.gnome.org/sources/libxml2/2.9/libxml2-${LIBXML2_VERSION}.tar.xz && \
	curl -fsSLO https://download.gnome.org/sources/libxslt/1.1/libxslt-${LIBXSLT_VERSION}.tar.xz && \
	echo "${LIBXML2_SHA256}  libxml2-${LIBXML2_VERSION}.tar.xz" | sha256sum -c - && \
	echo "${LIBXSLT_SHA256}  libxslt-${LIBXSLT_VERSION}.tar.xz" | sha256sum -c - && \
	tar xf libxml2-${LIBXML2_VERSION}.tar.xz && tar xf libxslt-${LIBXSLT_VERSION}.tar.xz
RUN cd libxml2-${LIBXML2_VERSION} && \
	CFLAGS="-fsanitize=address -fno-omit-frame-pointer -g -O1" LDFLAGS="-fsanitize=address" \
	./configure --prefix=/opt/asan --without-python --without-lzma --without-zlib --without-icu -q && \
	make -j"$(nproc)" -s && make install -s
RUN cd libxslt-${LIBXSLT_VERSION} && \
	CFLAGS="-fsanitize=address -fno-omit-frame-pointer -g -O1" LDFLAGS="-fsanitize=address" \
	PKG_CONFIG_PATH=/opt/asan/lib/pkgconfig ./configure --prefix=/opt/asan --with-libxml-prefix=/opt/asan --without-python --without-crypto -q && \
	make -j"$(nproc)" -s && make install -s
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY binding.gyp ./
COPY src ./src
RUN PKG_CONFIG_PATH=/opt/asan/lib/pkgconfig \
	CXXFLAGS="-fsanitize=address,undefined -fno-sanitize-recover=undefined -fno-omit-frame-pointer -g" \
	LDFLAGS="-fsanitize=address,undefined -Wl,-rpath,/opt/asan/lib" npm run build
COPY . .
ENV ASAN_OPTIONS=detect_leaks=0:abort_on_error=1 UBSAN_OPTIONS=print_stacktrace=1:halt_on_error=1
CMD ["sh", "-c", "LD_PRELOAD=$(gcc -print-file-name=libasan.so) npx mocha"]
