// Module entry point: one-time library setup and per-environment exports

#include <cstdlib>
#include <mutex>
#include <string>

#include <napi.h>
#include <libxml/parser.h>
#include <libxslt/xslt.h>
#include <libxslt/xsltconfig.h>
#include <libexslt/exslt.h>

#include "core/xslt.h"
#include "napi/addon_data.h"
#include "napi/stylesheet.h"
#include "napi/xpath.h"
#include "napi/xslt.h"

namespace {

std::once_flag libraryInit;

// libxml2 and libxslt process-wide setup. The module can be loaded by several
// environments (main thread and worker threads), but this must run only once.
void InitLibraries() {
    LIBXML_TEST_VERSION
    xmlInitParser();
    nlx::InitXslt();
}

// Formats a libxml-style version number (major * 10000 + minor * 100 + patch) as x.y.z
std::string FormatVersion(int version) {
    return std::to_string(version / 10000) + "." +
           std::to_string(version / 100 % 100) + "." +
           std::to_string(version % 100);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    std::call_once(libraryInit, InitLibraries);

    // Versions of the libraries loaded at runtime, not the headers built against
    Napi::Object versions = Napi::Object::New(env);
    versions.Set("libxml2", FormatVersion(std::atoi(xmlParserVersion)));
    versions.Set("libxslt", FormatVersion(xsltLibxsltVersion));
    versions.Set("libexslt", FormatVersion(exsltLibexsltVersion));
    exports.Set("versions", versions);

    nlx::AddonData* data = new nlx::AddonData();
    data->stylesheetConstructor = Napi::Persistent(nlx::Stylesheet::DefineClass(env));
    env.SetInstanceData(data);
    nlx::RegisterXslt(env, exports);
    nlx::RegisterXPath(env, exports);
    return exports;
}

}  // namespace

NODE_API_MODULE(node_libxslt, Init)
