import engineHandler from "./kengine.mjs";

/**
 * Vercel entry point for /api/bridge.
 * Normalize the URL because Vercel rewrites can preserve the public URL
 * instead of exposing the internal /api/* path to the shared handler.
 */
export default function handler(req, res) {
  req.url = "/api/bridge";
  return engineHandler(req, res);
}
