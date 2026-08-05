import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: an unrelated lockfile in the user's home directory
  // otherwise gets inferred and Turbopack warns on every build.
  turbopack: {
    root: path.resolve(__dirname),
  },

  /**
   * Emit a self-contained server bundle in .next/standalone.
   *
   * Without this the Docker image would have to carry all of node_modules
   * (hundreds of MB) just to run. With it, the runtime stage copies a traced
   * subset plus a ready-made server.js.
   *
   * Note this app must run as a long-lived Node process, not on serverless:
   * issuance is started after the webhook response is sent, and the session and
   * record stores live in memory. See the deployment notes in README.md.
   */
  output: "standalone",
};

export default nextConfig;
