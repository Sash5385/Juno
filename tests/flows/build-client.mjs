import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = process.env.CLIENT_DIR || resolve(HERE, "../../../DrivePad-Client");
const { build } = await import(resolve(CLIENT, "node_modules/esbuild/lib/main.js"));
await build({
  entryPoints: [resolve(HERE, "entry.js")], bundle: true, platform: "node", format: "esm", outfile: resolve(HERE, "client.bundle.mjs"),
  nodePaths: [resolve(CLIENT, "node_modules")], logLevel: "warning",
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  define: { "import.meta.env": "{}" },
  plugins: [{ name: "cfg", setup(b) {
    b.onResolve({ filter: /^client-db$/ }, () => ({ path: resolve(CLIENT, "src/firebase/db.js") })); b.onResolve({ filter: /\/config$/ }, (a) => a.importer.endsWith("firebase/db.js") ? { path: resolve(HERE, "testconfig.js") } : null); } }],
});
console.log("built");
