import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "cloud-sharing-metadata",
      transformIndexHtml(html, ctx) {
        if (ctx.server) return html;
        return process.env.FITNESS_CLOUD === "1"
          ? html
              .replace(
                "</head>",
                '<link rel="manifest" href="/manifest.webmanifest"/><meta name="theme-color" content="#2463eb"/><meta name="apple-mobile-web-app-capable" content="yes"/></head>',
              )
              .replaceAll(
                "https://vorojar.github.io/training-journal/",
                "https://fitness.bibidu.com/",
              )
              .replace(
                "数据保存在当前浏览器。",
                "独立账号、云端同步与授权教练协作。",
              )
          : html;
      },
    },
  ],
  base: "/training-journal/",
});
