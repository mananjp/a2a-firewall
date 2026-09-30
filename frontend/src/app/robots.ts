import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The dashboard requires a session and has no value in search results.
      disallow: ["/dashboard", "/api/"],
    },
    sitemap: `${SITE.siteUrl}/sitemap.xml`,
    host: SITE.siteUrl,
  };
}
