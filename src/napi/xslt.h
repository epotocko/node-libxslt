// XSLT functions exported to JavaScript, in synchronous and asynchronous forms

#ifndef SRC_NAPI_XSLT_H_
#define SRC_NAPI_XSLT_H_

#include <napi.h>

namespace nlx {

// compileStylesheetSync(source) -> Stylesheet
// compileStylesheetAsync(source, callback(err, Stylesheet))
// applyStylesheetSync(stylesheet, xml, params) -> string
// applyStylesheetAsync(stylesheet, xml, params, callback(err, string))
// params alternates names and XPath expressions.
void RegisterXslt(Napi::Env env, Napi::Object exports);

}  // namespace nlx

#endif  // SRC_NAPI_XSLT_H_
