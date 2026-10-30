#include "stylesheet.h"

#include <utility>

#include "addon_data.h"

namespace nlx {

Napi::Function Stylesheet::DefineClass(Napi::Env env) {
    return ObjectWrap<Stylesheet>::DefineClass(env, "Stylesheet", {});
}

Napi::Object Stylesheet::New(Napi::Env env, StylesheetPtr stylesheet) {
    Napi::Object object = GetAddonData(env).stylesheetConstructor.New({
        Napi::External<xsltStylesheet>::New(env, stylesheet.get())
    });
    // The constructor took ownership
    stylesheet.release();
    return object;
}

Stylesheet* Stylesheet::FromValue(const Napi::Value& value) {
    Napi::Env env = value.Env();
    if (!value.IsObject() ||
        !value.As<Napi::Object>().InstanceOf(GetAddonData(env).stylesheetConstructor.Value())) {
        throw Napi::TypeError::New(env, "Expected a compiled stylesheet");
    }
    return Unwrap(value.As<Napi::Object>());
}

Stylesheet::Stylesheet(const Napi::CallbackInfo& info) : ObjectWrap<Stylesheet>(info) {
    if (info.Length() != 1 || !info[0].IsExternal()) {
        throw Napi::TypeError::New(info.Env(), "Stylesheet cannot be constructed directly; use parse()");
    }
    stylesheet_.reset(info[0].As<Napi::External<xsltStylesheet>>().Data());
}

}  // namespace nlx
