{
  "targets": [
    {
      "target_name": "node-libxslt",
      "sources": [ "src/node_libxslt.cc", "src/stylesheet.cc" ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
        "<!@(node -p \"require('node-addon-api').include\")"
			],
      "dependencies": [
        "./deps/libxslt.gyp:libxslt",
        "./deps/libxslt.gyp:libexslt",
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    }
  ]
}
