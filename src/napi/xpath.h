// XPath functions exported to JavaScript, in synchronous and asynchronous forms

#ifndef SRC_NAPI_XPATH_H_
#define SRC_NAPI_XPATH_H_

#include <napi.h>

namespace nlx {

// xpathSelectSync(xml, expression, fields, first) -> descriptors, or a descriptor or null when first
// xpathSelectAsync(xml, expression, fields, first, callback(err, result))
// xpathUpdateSync(xml, expression, value, format) -> string
// xpathUpdateAsync(xml, expression, value, format, callback(err, string))
// fields is the bit mask of nlx::Field values to compute.
void RegisterXPath(Napi::Env env, Napi::Object exports);

}  // namespace nlx

#endif  // SRC_NAPI_XPATH_H_
