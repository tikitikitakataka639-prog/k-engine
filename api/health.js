import engineHandler from "./kengine.mjs";

/**
 * Vercel entry point for /api/health.
 * Normalize the URL because Vercel rewrites can preserve the public URL
 * instead of exposing the internal /api/* path to the shared handler.
 */
export default function handler(req, res) {
  req.url = "/api/health";
  return engineHandler(req, res);
}
