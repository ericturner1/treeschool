import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/auth/", "/dashboard/", "/p/", "/parent/", "/parents/"]
    },
    sitemap: "https://www.treehomeschool.com/sitemap.xml",
    host: "https://www.treehomeschool.com"
  };
}
