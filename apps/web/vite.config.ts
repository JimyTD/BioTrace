import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/**
 * 只挂在 dev server 上的静态目录。
 *
 * 走查对比页和 v1/v2 原型是长期要留的视觉基准（见
 * prototypes/clear-tree/README.md），但它们不能放 public/ —— 那样会随生产包发到
 * 线上，而且上线后还是坏的：里面的 iframe 指向生产不注册的 /dev/tree。放在
 * 仓库里由 dev server 挂出来，才能既入库可追溯、又进不了生产包。
 */
function devStatic(prefix: string, dir: string): Plugin {
  const root = resolve(HERE, dir);
  return {
    name: `biotrace-dev-static:${prefix}`,
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(prefix, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "");
        const file = resolve(join(root, rel));
        // 越出挂载根的路径一概不给，别让走查台变成任意文件读取
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
        // 走查靠反复重载看差异，缓存住就会拿旧的骗自己
        res.setHeader("Cache-Control", "no-store");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    devStatic("/devpages", "devpages"),
    devStatic("/proto", "../../prototypes"),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["@biotrace/messages"],
  },
});
