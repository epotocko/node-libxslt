// Per-environment state (main thread and each worker thread get their own)

#ifndef SRC_NAPI_ADDON_DATA_H_
#define SRC_NAPI_ADDON_DATA_H_

#include <napi.h>

namespace nlx {

struct AddonData {
    Napi::FunctionReference stylesheetConstructor;
};

inline AddonData& GetAddonData(Napi::Env env) {
    return *env.GetInstanceData<AddonData>();
}

}  // namespace nlx

#endif  // SRC_NAPI_ADDON_DATA_H_
