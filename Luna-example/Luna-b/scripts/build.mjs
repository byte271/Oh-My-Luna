import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDirectory = resolve(projectRoot, 'dist');
const sourceFiles = [
  'constants.ts',
  'crc32.ts',
  'encoder.ts',
  'decoder.ts',
  'index.ts',
  'cli.ts'
];

function rewriteLocalImports(source) {
  return source
    .replace(/(\bfrom\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2')
    .replace(/(\bimport\(\s*['"][^'"]+)\.ts(['"])/g, '$1.js$2');
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const fileName of sourceFiles) {
  const sourcePath = resolve(projectRoot, 'src', fileName);
  const outputPath = resolve(outputDirectory, fileName.replace(/\.ts$/, '.js'));
  const source = await readFile(sourcePath, 'utf8');
  const stripped = stripTypeScriptTypes(source, { mode: 'strip' });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rewriteLocalImports(stripped), 'utf8');
}

console.log(`Built ${sourceFiles.length} files in ${outputDirectory}.`);
