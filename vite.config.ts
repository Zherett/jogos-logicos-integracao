import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Generates a lightweight SPA hash-redirect 404.html fallback and .nojekyll in dist/ for GitHub Pages. */
function githubPagesSpaPlugin(): Plugin {
  return {
    name: "github-pages-spa",
    closeBundle() {
      const distDir = resolve(process.cwd(), "dist");
      const indexHtml = resolve(distDir, "index.html");
      if (existsSync(indexHtml)) {
        const rawBase = process.env.GITHUB_PAGES_BASE || "";
        const normalizedBase =
          rawBase.startsWith("/") && rawBase !== "./"
            ? rawBase.endsWith("/")
              ? rawBase
              : `${rawBase}/`
            : "";
        const redirectHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Redirecionando — Desafios de Lógica SEMED</title>
    <script>
      (function () {
        var configured = ${JSON.stringify(normalizedBase)};
        var path = window.location.pathname || "/";
        var base = configured;
        if (!base) {
          if (window.location.hostname.endsWith(".github.io")) {
            var segs = path.split("/").filter(Boolean);
            base = segs.length > 0 ? "/" + segs[0] + "/" : "/";
          } else {
            base = "/";
          }
        }
        var rest = path.indexOf(base) === 0 ? path.slice(base.length) : path.replace(/^\\/+/, "");
        var search = window.location.search || "";
        var hash = window.location.hash || "";
        var cleanHash = hash && hash !== "#/" ? hash.replace(/^#/, "") : "";
        var target = base + "#/" + rest.replace(/^\\/+/, "") + search + cleanHash;
        window.location.replace(target);
      })();
    </script>
  </head>
  <body>
    <noscript>
      <p>Redirecionando... <a href="./">Voltar ao início</a></p>
    </noscript>
  </body>
</html>
`;
        writeFileSync(resolve(distDir, "404.html"), redirectHtml, "utf8");
        writeFileSync(resolve(distDir, ".nojekyll"), "");
      }
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE || "./",
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    react(),
    githubPagesSpaPlugin(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: "vendor-ui",
              test: /[\\/]node_modules[\\/](@radix-ui|@tanstack)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
});
