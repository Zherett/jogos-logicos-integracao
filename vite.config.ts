import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

/** Generates 404.html fallback and .nojekyll in dist/ for seamless GitHub Pages hosting. */
function githubPagesSpaPlugin(): Plugin {
  return {
    name: "github-pages-spa",
    closeBundle() {
      const distDir = resolve(process.cwd(), "dist");
      const indexHtml = resolve(distDir, "index.html");
      if (existsSync(indexHtml)) {
        copyFileSync(indexHtml, resolve(distDir, "404.html"));
        writeFileSync(resolve(distDir, ".nojekyll"), "");
      }
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE || "./",
  plugins: [
    tsconfigPaths(),
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
