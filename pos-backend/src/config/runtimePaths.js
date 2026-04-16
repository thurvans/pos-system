const fs = require('node:fs');
const path = require('node:path');

const normalizeDir = (value) => {
  const resolved = String(value || '').trim();
  return resolved ? path.resolve(resolved) : null;
};

const dataRoot = normalizeDir(process.env.APP_DATA_DIR) || process.cwd();

const resolveDataPath = (...segments) => path.join(dataRoot, ...segments);

const ensureDataDirSync = (...segments) => {
  const targetDir = resolveDataPath(...segments);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
};

module.exports = {
  DATA_ROOT: dataRoot,
  ensureDataDirSync,
  resolveDataPath,
};
