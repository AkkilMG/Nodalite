import { defineConfig } from "vitepress";

const base = process.env.CUSTOM_DOMAIN ? "/" : "/Nodalite/";

export default defineConfig({
  base,
  title: "Nodalite",
  description: "Runtime-agnostic TypeScript API framework for Node, Bun, Deno, Cloudflare Workers, and AWS Lambda.",
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ["link", { rel: "icon", href: `${base}favicon.ico` }],
  ],

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
            { text: "@nodalite/adapter-node", link: "/api/adapter-node" },
            { text: "@nodalite/adapter-lambda", link: "/api/adapter-lambda" },
            { text: "@nodalite/adapter-edge", link: "/api/adapter-edge" },
            { text: "@nodalite/workers", link: "/api/workers" },
            { text: "@nodalite/scheduler", link: "/api/scheduler" },
            { text: "@nodalite/ml", link: "/api/ml" },
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
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/AkkilMG/nodalite" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2024-present Akkil",
    },

    search: {
      provider: "local",
    },
  },
});
