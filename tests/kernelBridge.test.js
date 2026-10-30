import assert from "node:assert/strict";
import {
  BRIDGE_PROTOCOL,
  KERNEL_ALLOWED_ORIGINS,
  isAllowedKernelOrigin,
} from "../src/engine/kernelBridge.js";

const officialLovableOrigin = "https://project-kernel-release-1-0-0.lovable.app";

assert(KERNEL_ALLOWED_ORIGINS.includes(officialLovableOrigin), "allowlist includes the official KERNEL Lovable origin");
assert(isAllowedKernelOrigin(officialLovableOrigin), "official KERNEL Lovable origin is accepted");
assert(!isAllowedKernelOrigin("http://project-kernel-release-1-0-0.lovable.app"), "insecure HTTP origin is rejected");
assert(!isAllowedKernelOrigin("https://project-kernel-release-1-0-0.lovable.app.attacker.example"), "lookalike origin is rejected");
assert(!isAllowedKernelOrigin("https://unlisted.example"), "unlisted origin is rejected");

assert.equal(BRIDGE_PROTOCOL.request, "KERNEL_REQUEST", "request protocol name remains stable");
assert.equal(BRIDGE_PROTOCOL.ready, "KENGINE_BRIDGE_READY", "ready protocol name remains stable");
assert.equal(BRIDGE_PROTOCOL.response, "KENGINE_RESPONSE", "response protocol name remains stable");
assert.equal(BRIDGE_PROTOCOL.error, "KENGINE_ERROR", "error protocol name remains stable");

console.log("KERNEL bridge origin and protocol tests passed");
