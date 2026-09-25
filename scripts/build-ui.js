const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const marker = path.join(root, 'gen/ui/.framework-version');
const version = fs.readFileSync(path.join(root, 'ui5.yaml'), 'utf8');
const buildInfoPath = path.join(root, 'gen/ui/build-info.json');
const ensure = process.argv.includes('--ensure');
// UI5 npm libraries contain LESS sources. Build the local runtime once per
// version; app code is served directly from app/ so development remains live.
if (!process.argv.includes('--force') && fs.existsSync(marker) && fs.readFileSync(marker,'utf8') === version) {
  console.log('Local UI5 runtime is ready.');
} else {
  const cli = path.join(root, 'node_modules/@ui5/cli/bin/ui5.cjs');
  const result = spawnSync(process.execPath, [cli, 'build', '--all', '--dest', 'gen/ui'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
  fs.writeFileSync(marker, version);
}
// Explicit builds get a new version, even when the UI5 runtime is cached.
// Startup preserves the image's build date.
if (!ensure || !fs.existsSync(buildInfoPath)) {
  fs.writeFileSync(buildInfoPath, JSON.stringify({ builtAt: new Date().toISOString() }, null, 2) + '\n');
}
