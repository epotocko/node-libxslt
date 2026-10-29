# Builds and tests the addon against the system libxml2/libxslt of the Debian Node images.
#   full:    node:<v> image, which already ships the -dev packages (as eql-noflo's image does)
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
