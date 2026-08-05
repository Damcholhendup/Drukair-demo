import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: an unrelated lockfile in the user's home directory
  // otherwise gets inferred and Turbopack warns on every build.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
