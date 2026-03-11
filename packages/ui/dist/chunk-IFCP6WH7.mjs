// src/components/index.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
var COMPONENT_VERSION = "0.1.0";

export {
  cn,
  COMPONENT_VERSION
};
//# sourceMappingURL=chunk-IFCP6WH7.mjs.map