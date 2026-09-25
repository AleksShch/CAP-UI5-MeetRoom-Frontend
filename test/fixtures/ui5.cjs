const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load application models without a browser or the UI5 rendering runtime.
module.exports = function ui5Loader(overrides = {}, globals = {}) {
  const cache = new Map(Object.entries(overrides));
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    if (!name.startsWith('rsvroom/')) throw new Error('Unexpected UI dependency: ' + name);
    const file = path.join(__dirname, '../../app', name.slice('rsvroom/'.length) + '.js');
    let exported;
    vm.runInNewContext(
      fs.readFileSync(file, 'utf8'),
      {
        Date,
        Intl,
        ...globals,
        sap: {
          ui: {
            define: (dependencies, factory) => {
              exported = factory(...dependencies.map(load));
            }
          }
        }
      },
      { filename: file }
    );
    cache.set(name, exported);
    return exported;
  }
  return load;
};
