#include <napi.h>
#include <nan.h>

Napi::Value StylesheetSync(const Napi::CallbackInfo&);
Napi::Value StylesheetAsync(const Napi::CallbackInfo&);
Napi::Value ApplySync(const Napi::CallbackInfo&);
Napi::Value ApplyAsync(const Napi::CallbackInfo&);
Napi::Value RegisterEXSLT(const Napi::CallbackInfo&);