#include "stylesheet.h"

Stylesheet::Stylesheet(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Stylesheet>(info)  {

}

Stylesheet::~Stylesheet() {
    xsltFreeStylesheet(stylesheet_obj);
}

Napi::Object Stylesheet::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    // Setup Stylesheet class definition
    Napi::Function func = DefineClass(env, "Stylesheet", {});

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);

    exports.Set("Stylesheet", func);
    
    env.SetInstanceData<Napi::FunctionReference>(constructor);

    return exports;
}

// not called from node, private api
Napi::Value Stylesheet::New(Napi::Env env, xsltStylesheetPtr stylesheetPtr) {
    Napi::FunctionReference* constructor = env.GetInstanceData<Napi::FunctionReference>();
    Napi::Value value = constructor->New({ });
    Stylesheet* stylesheet = Napi::ObjectWrap<Stylesheet>::Unwrap(value.As<Napi::Object>());
    stylesheet->stylesheet_obj = stylesheetPtr;
    return value;
}
