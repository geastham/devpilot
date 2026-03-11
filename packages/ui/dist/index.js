"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  COMPONENT_VERSION: () => COMPONENT_VERSION,
  HOOKS_VERSION: () => HOOKS_VERSION,
  STORE_VERSION: () => STORE_VERSION,
  cn: () => cn
});
module.exports = __toCommonJS(index_exports);

// src/components/index.ts
var import_clsx = require("clsx");
var import_tailwind_merge = require("tailwind-merge");
function cn(...inputs) {
  return (0, import_tailwind_merge.twMerge)((0, import_clsx.clsx)(inputs));
}
var COMPONENT_VERSION = "0.1.0";

// src/stores/index.ts
var STORE_VERSION = "0.1.0";

// src/hooks/index.ts
var HOOKS_VERSION = "0.1.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  COMPONENT_VERSION,
  HOOKS_VERSION,
  STORE_VERSION,
  cn
});
//# sourceMappingURL=index.js.map