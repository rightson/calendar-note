import * as esbuild from 'esbuild';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledLicenses } from './scripts/licenses.mjs';
import { bundleOptions } from './scripts/build-options.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const notices = await bundledLicenses(root);

await esbuild.build({
  ...bundleOptions,
  outfile: 'main.js',
  sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
  // Community installs only main.js, manifest.json, and styles.css.
  banner: { js: notices.split('\n').map(line => `// ${line}`).join('\n') },
  logLevel: 'info',
});
