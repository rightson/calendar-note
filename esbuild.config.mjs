import * as esbuild from 'esbuild';
import { builtinModules } from 'node:module';

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  outfile: 'main.js',
  sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
  minify: process.env.NODE_ENV === 'production',
  external: ['obsidian', 'electron', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
  logLevel: 'info',
});
