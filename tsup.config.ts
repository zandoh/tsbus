import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  sourcemap: false,
  target: "es2022",
  external: [],
  outDir: "dist",
  env: {
    NODE_ENV: "production",
  },
  esbuildOptions(options) {
    options.legalComments = "none";
    options.platform = "neutral";
  },
});
