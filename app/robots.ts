import type { MetadataRoute } from "next";

// Belt and braces alongside the per-page `noindex`. A crawler that respects
// robots.txt never requests these paths at all, which matters because the
// token in a /r/ URL is the ONLY thing protecting a private read of someone's
// group chat. The meta tag is the real guarantee (it also covers crawlers
// that ignore this file); this just means well-behaved ones don't come
// knocking in the first place.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/r/", "/status/", "/api/", "/admin/"],
    },
  };
}
