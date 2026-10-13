import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // core reads prompts/*.md from disk at request time; ship them with the route on Vercel (D34).
  outputFileTracingIncludes: { "/api/converse": ["./prompts/**/*"] },
};

export default nextConfig;
