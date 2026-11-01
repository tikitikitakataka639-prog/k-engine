import assert from "node:assert/strict";
import {
  BRIDGE_PROTOCOL,
  KERNEL_ALLOWED_ORIGINS,
  isAllowedKernelOrigin,
  postToKernel,
} from "../src/engine/kernelBridge.js";

const officialLovableOrigin = "https://project-kernel-release-1-0-0.lovable.app";

assert(KERNEL_ALLOWED_ORIGINS.includes(officialLovableOrigin), "allowlist includes the official KERNEL Lovable origin");
assert(isAllowedKernelOrigin(officialLovableOrigin), "official KERNEL Lovable origin is accepted");
assert(!isAllowedKernelOrigin("http://project-kernel-release-1-0-0.lovable.app"), "insecure HTTP origin is rejected");
assert(!isAllowedKernelOrigin("https://project-kernel-release-1-0-0.lovable.app.attacker.example"), "lookalike origin is rejected");
assert(!isAllowedKernelOrigin("https://unlisted.example"), "unlisted origin is rejected");

assert.equal(BRIDGE_PROTOCOL.hello, "KERNEL_PING", "handshake ping protocol name is stable");
assert.equal(BRIDGE_PROTOCOL.request, "KERNEL_REQUEST", "request protocol name remains stable");
assert.equal(BRIDGE_PROTOCOL.ready, "KENGINE_BRIDGE_READY", "ready protocol name remains stable");
assert.equal(BRIDGE_PROTOCOL.response, "KENGINE_RESPONSE", "response protocol name remains stable");
assert.equal(BRIDGE_PROTOCOL.error, "KENGINE_ERROR", "error protocol name remains stable");

const sent = [];
const opener = {
  closed: false,
  postMessage: (payload, targetOrigin) => sent.push({ payload, targetOrigin }),
};
assert.equal(
  postToKernel(opener, { type: BRIDGE_PROTOCOL.ready }, officialLovableOrigin),
  true,
  "valid handshake reply is sent",
);
assert.equal(sent.length, 1, "reply is sent exactly once");
assert.equal(sent[0].targetOrigin, officialLovableOrigin, "reply uses the validated event origin");
assert.equal(
  postToKernel(opener, { type: BRIDGE_PROTOCOL.ready }, "https://unlisted.example"),
  false,
  "reply to an unlisted origin is rejected",
);
assert.equal(sent.length, 1, "rejected origin receives no message");

console.log("KERNEL bridge origin and protocol tests passed");
