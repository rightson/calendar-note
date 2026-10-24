import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Resolve the installed runtime dependency graph, including transitive packages. */
export async function bundledLicenses(root) {
  const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const names = new Set();
  const visit = async (name) => {
    if (names.has(name)) return;
    names.add(name);
    const directory = join(root, 'node_modules', name);
    const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(metadata.dependencies ?? {})) await visit(dependency);
  };
  for (const dependency of Object.keys(project.dependencies ?? {})) await visit(dependency);

  const notices = [`${project.name} license`, '', await readFile(join(root, 'LICENSE'), 'utf8')];
  for (const name of [...names].sort()) {
    const directory = join(root, 'node_modules', name);
    const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const licenseFile = (await readdir(directory)).find(file => /^LICEN[CS]E(?:\..*)?$/i.test(file));
    if (!licenseFile) throw new Error(`Missing license text for ${name}@${metadata.version}`);
    notices.push(`===== ${name}@${metadata.version} (${metadata.license ?? 'see license text'}) =====`);
    notices.push(await readFile(join(directory, licenseFile), 'utf8'));
  }
  return notices.join('\n');
}
