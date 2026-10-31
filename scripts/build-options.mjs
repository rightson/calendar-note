import { builtinModules } from 'node:module';

/** esbuild options shared by the release build and `npm run dev`. */
export const bundleOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  // Keep the Community release readable; minification is optional guidance.
  minify: false,
  external: ['obsidian', 'electron', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
};
