import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const tileRoot = path.join(appRoot, 'assets', 'tiles');
const manifestPath = path.join(appRoot, 'assets', 'tile-manifest.json');
const imageExtensions = new Set(['.gif', '.jpg', '.jpeg', '.png', '.webp']);

const seenTargets = new Set();
const entries = [];

const files = await listFiles(tileRoot);
for (const absolutePath of files) {
  assertInside(tileRoot, absolutePath);

  const extension = path.extname(absolutePath).toLowerCase();
  if (!imageExtensions.has(extension)) continue;

  const currentRelativePath = toPosix(path.relative(tileRoot, absolutePath));
  const baseName = path.basename(absolutePath, extension);
  const originalCode = getOriginalCode(baseName);
  const classification = classify(originalCode, currentRelativePath);
  const targetFileName = uniqueTargetName(classification.slug, originalCode, extension);
  const targetRelativePath = toPosix(path.join(classification.category, targetFileName));
  const targetPath = path.join(tileRoot, targetRelativePath);
  assertInside(tileRoot, targetPath);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (path.resolve(absolutePath) !== path.resolve(targetPath)) {
    await moveFile(absolutePath, targetPath);
  }

  entries.push({
    code: originalCode,
    label: classification.label,
    category: classification.category,
    filename: targetFileName,
    relativePath: targetRelativePath,
    url: `/tiles/${targetRelativePath.split('/').map(encodeURIComponent).join('/')}`
  });
}

entries.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
await fs.writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), tiles: entries }, null, 2)}\n`);

await removeEmptyDirectories(tileRoot);

console.log(`Organized ${entries.length} tile images.`);
console.log(`Wrote ${path.relative(appRoot, manifestPath)}.`);

async function listFiles(root) {
  const output = [];
  const children = await fs.readdir(root, { withFileTypes: true });

  for (const child of children) {
    const absolutePath = path.join(root, child.name);
    if (child.isDirectory()) {
      output.push(...await listFiles(absolutePath));
    } else if (child.isFile()) {
      output.push(absolutePath);
    }
  }

  return output;
}

async function moveFile(source, target) {
  try {
    await fs.rename(source, target);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.copyFile(source, target);
    await fs.unlink(source);
  }
}

function classify(code, relativePath) {
  const normalized = code.toLowerCase();
  const pathText = relativePath.toLowerCase();
  const clean = humanize(code);

  if (pathText.includes('/tob/')) return classifyNamedObject(normalized, clean);
  if (/^a/.test(normalized)) return tile('terrain/floors', 'floor terrain tile', 'floor-terrain');
  if (/^p/.test(normalized)) return tile('terrain/textures', 'floor texture tile', 'floor-texture');
  if (/^(g|h|i)[a-d]?\d/.test(normalized)) return tile('terrain/flora', 'tree or flora tile', 'tree-flora');
  if (/^(b|d|e|m)/.test(normalized)) return tile('objects/walls-doors', 'wall or door tile', 'wall-door');
  if (/^(f|u|v)/.test(normalized)) return tile('objects/props', 'map object tile', 'map-object');
  if (/^(l|j|k|n|o)/.test(normalized)) return tile('shapes/lines', 'line or shape tile', 'line-shape');
  if (/^q/.test(normalized)) return tile('objects/effects', 'effect tile', 'effect');
  if (/^1/.test(normalized)) return tile('people/characters', 'character marker tile', 'character-marker');
  if (/^(r|s)/.test(normalized)) return tile('creatures/large', 'large creature or figure tile', 'large-creature');
  if (/^(t|c|y)/.test(normalized)) return tile('objects/effects', 'fire or effect tile', 'fire-effect');
  if (/^z/.test(normalized)) return tile('shapes/markers', 'tool or marker tile', 'tool-marker');
  return tile('objects/misc', 'miscellaneous tile', 'misc-tile');

  function tile(category, label, slug) {
    return { category, label: `${label} ${clean}`, slug };
  }
}

function classifyNamedObject(normalized, clean) {
  const thumbnail = normalized.endsWith('_t') ? ' thumbnail' : '';
  const slugBase = normalized.replace(/_t$/, '');

  if (slugBase.includes('fire') || slugBase.includes('kaleidoscope') || slugBase.includes('mandala')) {
    return named('objects/effects', `effect ${clean}${thumbnail}`, 'effect');
  }

  if (slugBase.includes('river')) return named('terrain/water', `river terrain ${clean}${thumbnail}`, 'river');
  if (slugBase.includes('grass')) return named('terrain/flora', `grass terrain ${clean}${thumbnail}`, 'grass');
  if (slugBase.includes('floor')) return named('terrain/floors', `floor terrain ${clean}${thumbnail}`, 'floor');
  if (slugBase.includes('road')) return named('terrain/roads-rails', `road terrain ${clean}${thumbnail}`, 'road');
  if (slugBase.includes('rail')) return named('terrain/roads-rails', `rail terrain ${clean}${thumbnail}`, 'rail');
  if (slugBase.includes('rug')) return named('objects/furnishings', `rug furnishing ${clean}${thumbnail}`, 'rug');
  if (slugBase.includes('monster') || slugBase.includes('bigfoot')) return named('creatures/large', `creature ${clean}${thumbnail}`, 'creature');

  return named('objects/props', `object ${clean}${thumbnail}`, 'object');
}

function named(category, label, slug) {
  return { category, label, slug };
}

function getOriginalCode(baseName) {
  const marker = baseName.lastIndexOf('--');
  const value = marker === -1 ? baseName : baseName.slice(marker + 2);
  return normalizeOriginalCode(value);
}

function normalizeOriginalCode(value) {
  const withoutDottedExtension = value.replace(/\.(gif|jpg|jpeg|png|webp)$/i, '');
  if (/^[a-z0-9]+-(gif|jpg|jpeg|png|webp)$/i.test(withoutDottedExtension) && withoutDottedExtension.length > 8) {
    return withoutDottedExtension.replace(/-(gif|jpg|jpeg|png|webp)$/i, '');
  }

  return withoutDottedExtension;
}

function uniqueTargetName(slug, code, extension) {
  const safeCode = slugify(code);
  let candidate = `${slug}--${safeCode}${extension}`;
  let counter = 2;

  while (seenTargets.has(candidate.toLowerCase())) {
    candidate = `${slug}-${counter}--${safeCode}${extension}`;
    counter += 1;
  }

  seenTargets.add(candidate.toLowerCase());
  return candidate;
}

function humanize(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function assertInside(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside ${root}: ${target}`);
  }
}

async function removeEmptyDirectories(root) {
  const children = await fs.readdir(root, { withFileTypes: true });
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const absolutePath = path.join(root, child.name);
    await removeEmptyDirectories(absolutePath);
    const remaining = await fs.readdir(absolutePath);
    if (remaining.length === 0) await fs.rmdir(absolutePath);
  }
}
