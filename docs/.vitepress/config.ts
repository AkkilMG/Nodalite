import { defineConfig, HeadConfig } from "vitepress";

const base = process.env.CUSTOM_DOMAIN ? "/" : "/Nodalite/";
const hostname = process.env.CUSTOM_DOMAIN ? "https://nodalite.akkil.dev" : "https://akkilmg.github.io";

export default defineConfig({
  lang: "en-US",
  base,
  title: "Nodalite",
  description: "Runtime-agnostic TypeScript API framework for Node, Bun, Deno, Cloudflare Workers, and AWS Lambda.",
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname,
  },

  head: [
    ["link", { rel: "icon", href: `${base}favicon.ico` }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: `${base}favicon-32x32.png` }],
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: `${base}favicon-16x16.png` }],
    ["link", { rel: "apple-touch-icon", sizes: "192x192", href: `${base}apple-touch-icon.png` }],
    ["link", { rel: "manifest", href: `${base}site.webmanifest` }],
    ["meta", { name: "theme-color", content: "#3451b2" }],
    ["meta", { name: "og:type", content: "website" }],
    ["meta", { name: "og:locale", content: "en_US" }],
    ["meta", { name: "og:site_name", content: "Nodalite" }],
    ["meta", { name: "og:image", content: `${hostname}${base}light.png` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],

  transformHead: ({ pageData, siteConfig }) => {
    const head: HeadConfig[] = [];
    const frontmatter = pageData.frontmatter;
    const title = frontmatter.title
      ? `${frontmatter.title} | ${siteConfig.siteConfig.title}`
      : siteConfig.siteConfig.title;
    const description = frontmatter.description || siteConfig.siteConfig.description;
    const pagePath = pageData.relativePath.replace(/\.md$/, "").replace(/index$/, "");
    const pageUrl = `${hostname}${base}${pagePath}`;

    head.push(["meta", { property: "og:title", content: title }]);
    head.push(["meta", { property: "og:description", content: description }]);
    head.push(["meta", { property: "og:url", content: pageUrl }]);
    head.push(["meta", { name: "twitter:title", content: title }]);
    head.push(["meta", { name: "twitter:description", content: description }]);
    head.push(["link", { rel: "canonical", href: pageUrl }]);

    return head;
  },

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/" },
      { text: "API", link: "/api/" },
      { text: "Guides", link: "/guides/deployment" },
      { text: "Examples", link: "/examples/basic-api" },
      { text: "FAQ", link: "/faq" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "What is Nodalite?", link: "/guide/" },
            { text: "Quick Start", link: "/guide/quickstart" },
            { text: "Scaffolding", link: "/guide/scaffolding" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Core Concepts", link: "/guide/core-concepts" },
          ],
        },
      ],

      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "Overview", link: "/api/" },
            { text: "@nodalite/core", link: "/api/core" },
            { text: "@nodalite/middleware", link: "/api/middleware" },
            { text: "@nodalite/auth", link: "/api/auth" },
            { text: "@nodalite/adapter-node", link: "/api/adapter-node" },
            { text: "@nodalite/adapter-lambda", link: "/api/adapter-lambda" },
            { text: "@nodalite/adapter-edge", link: "/api/adapter-edge" },
            { text: "@nodalite/ws", link: "/api/ws" },
            { text: "@nodalite/workers", link: "/api/workers" },
            { text: "@nodalite/scheduler", link: "/api/scheduler" },
            { text: "@nodalite/otel", link: "/api/otel" },
            { text: "@nodalite/ml", link: "/api/ml" },
            { text: "@nodalite/openapi", link: "/api/openapi" },
            { text: "Errors", link: "/api/errors" },
          ],
        },
      ],

      "/guides/": [
        {
          text: "Topic Guides",
          items: [
            { text: "Deployment", link: "/guides/deployment" },
            { text: "Security Checklist", link: "/guides/security" },
            { text: "Background Threads", link: "/guides/background-threads" },
            { text: "ML Inference", link: "/guides/ml-inference" },
            { text: "Testing Strategy", link: "/guides/testing" },
            { text: "Publishing & Versioning", link: "/guides/publishing" },
            { text: "Naming & Rebranding", link: "/guides/rebranding" },
            { text: "Migration", link: "/guides/migration" },
            { text: "TypeScript", link: "/guides/typescript" },
          ],
        },
      ],

      "/examples/": [
        {
          text: "Examples",
          items: [
            { text: "Basic API", link: "/examples/basic-api" },
            { text: "Security API", link: "/examples/security-api" },
            { text: "Telegram Bot Thread", link: "/examples/telegram-bot" },
            { text: "Lambda Deployment", link: "/examples/lambda-deploy" },
            { text: "WebSocket Chat", link: "/examples/ws-chat" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/AkkilMG/nodalite" },
      { icon: "npm", link: "https://www.npmjs.com/package/nodalite" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026-present Akkil",
    },

    search: {
      provider: "local",
    },
  },
});
