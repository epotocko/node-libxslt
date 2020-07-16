#include "./document.h"

Document::Document(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Document>(info)  {

}

Document::~Document() {
    xmlFreeDocument(document_obj);
}

Napi::Object Document::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    // Setup Document class definition
    Napi::Function func = DefineClass(env, "Document", {});

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);

    exports.Set("Document", func);
    env.SetInstanceData<Napi::FunctionReference>(constructor);
    return exports;
}

// not called from node, private api
Napi::Value Document::New(xmlDocumentPtr documentPtr) {
    Napi::FunctionReference* constructor = env.GetInstanceData<Napi::FunctionReference>();
    Napi::Value value = constructor->New({});
    Document* document = Napi::ObjectWrap<Document>::Unwrap(value.As<Napi::Object>());
    document->document_obj = documentPtr;
    return value;
}
