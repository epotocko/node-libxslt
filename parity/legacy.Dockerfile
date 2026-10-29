# libxslt 0.10.2 (albanm/node-libxslt, with its bundled libxmljs fork) on Node 18, the last
# release of the package this one replaces; used to record the behavior to compare with.
FROM node:18
WORKDIR /legacy
RUN mkdir xml_modules
RUN cd /tmp && echo '{}' > package.json && npm install --global-style libxslt@0.10.2 && mv /tmp/node_modules/libxslt /legacy/xml_modules/libxslt
WORKDIR /src
