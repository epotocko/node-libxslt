// JavaScript wrapper owning a compiled stylesheet

#ifndef SRC_NAPI_STYLESHEET_H_
#define SRC_NAPI_STYLESHEET_H_

#include <napi.h>

#include "../core/xslt.h"

namespace nlx {

class Stylesheet : public Napi::ObjectWrap<Stylesheet> {
  public:
    static Napi::Function DefineClass(Napi::Env env);
    // Wraps a compiled stylesheet in a new JavaScript object, which takes ownership
    static Napi::Object New(Napi::Env env, StylesheetPtr stylesheet);
    // Throws a TypeError unless value is a Stylesheet created by New
    static Stylesheet* FromValue(const Napi::Value& value);

    // Only callable through New; JavaScript cannot construct an empty Stylesheet
    explicit Stylesheet(const Napi::CallbackInfo& info);

    xsltStylesheet* get() const { return stylesheet_.get(); }

  private:
    StylesheetPtr stylesheet_;
};

}  // namespace nlx

#endif  // SRC_NAPI_STYLESHEET_H_
