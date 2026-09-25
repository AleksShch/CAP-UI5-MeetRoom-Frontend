const path = require('node:path');
const fs = require('node:fs');
const root = path.join(__dirname, '../..');

function configuration(remote) {
  const buildInfoPath = path.join(root, 'gen/ui/build-info.json');
  const builtAt = fs.existsSync(buildInfoPath)
    ? JSON.parse(fs.readFileSync(buildInfoPath, 'utf8')).builtAt
    : null;
  return {
    serviceUrl: remote
      ? '/odata/v4/booking/'
      : process.env.ODATA_SERVICE_URL || '/odata/v4/booking/',
    csrfToken: !remote,
    batchDependencies: !remote,
    serverAreaNames: !remote,
    builtAt
  };
}
module.exports = { root, configuration };
