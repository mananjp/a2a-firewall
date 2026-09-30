import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site-config";

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

interface PublicRoute {
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
}

/**
 * Public routes only. Authenticated dashboard pages are excluded — they require
 * a session and should not be indexed.
 */
const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/terms", priority: 0.5, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.5, changeFrequency: "yearly" },
  { path: "/refund", priority: 0.5, changeFrequency: "yearly" },
  { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE.siteUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
