import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const packageRoot = join(root, 'dist', 'calendar-note');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (manifest.id !== 'calendar-note') throw new Error('Unexpected plugin ID in manifest.');
await stat(join(root, 'main.js'));
await rm(packageRoot, { recursive: true, force: true });
await mkdir(packageRoot, { recursive: true });
for (const name of ['main.js', 'manifest.json', 'LICENSE']) {
  await copyFile(join(root, name), join(packageRoot, name));
}
const optional = ['styles.css'];
for (const name of optional) {
  if ((await readdir(root)).includes(name)) await copyFile(join(root, name), join(packageRoot, name));
}
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const notices = ['Calendar-Note bundled dependency licenses', ''];
for (const name of Object.keys(packageJson.dependencies).sort()) {
  const dependencyRoot = join(root, 'node_modules', name);
  const dependency = JSON.parse(await readFile(join(dependencyRoot, 'package.json'), 'utf8'));
  const licenseFile = (await readdir(dependencyRoot)).find(file => /^LICEN[CS]E(?:\..*)?$/i.test(file));
  notices.push(`===== ${name}@${dependency.version} (${dependency.license ?? 'see license text'}) =====`);
  notices.push(licenseFile ? await readFile(join(dependencyRoot, licenseFile), 'utf8') : 'License text not bundled in npm package.');
  notices.push('');
}
await writeFile(join(packageRoot, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n'));
const dist = join(root, 'dist');
const archive = join(dist, 'calendar-note.zip');
await rm(archive, { force: true });
const zip = spawnSync('zip', ['-q', '-X', '-r', archive, 'calendar-note'], { cwd: dist, stdio: 'inherit' });
if (zip.error) throw zip.error;
if (zip.status !== 0) throw new Error(`zip exited with status ${zip.status}`);
console.log(`Packaged ${packageRoot} and ${archive}`);
