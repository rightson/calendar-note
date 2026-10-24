import * as esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledLicenses } from './scripts/licenses.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const notices = await bundledLicenses(root);

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  outfile: 'main.js',
  sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
  // Keep the Community release readable; minification is optional guidance.
  minify: false,
  // Community installs only main.js, manifest.json, and styles.css.
  banner: { js: notices.split('\n').map(line => `// ${line}`).join('\n') },
  external: ['obsidian', 'electron', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
  logLevel: 'info',
});
