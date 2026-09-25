const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function editor(update) {
  let Editor;
  const listeners = new Map(),
    errors = [],
    painted = [],
    fields = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../app/controller/FloorEditor.js'), 'utf8'),
    {
      sap: {
        ui: {
          define: (_names, factory) => {
            Editor = factory({}, {}, () => 'AREA1');
          }
        }
      },
      window: {
        addEventListener: (event, handler) => listeners.set(event, handler),
        removeEventListener: event => listeners.delete(event)
      }
    }
  );
  const object = { ID: 'area', x: 10, y: 20, width: 100, height: 80, radius: 8 };
  const model = {
    authEpoch: 1,
    maps: { FloorObjects: { area: object } },
    planObjectID: 'area',
    planDraft: { ...object },
    api: { update }
  };
  const app = {
    model,
    controls: {
      planCanvas: {
        applyGeometry: (_id, geometry) => painted.push({ ...geometry }),
        cancelInteraction() {}
      },
      planGeometryFields: Object.fromEntries(
        ['x', 'y', 'width', 'height', 'radius'].map(key => [
          key,
          {
            setValue: value => {
              fields[key] = value;
            }
          }
        ])
      )
    },
    runtime: {},
    controllers: {},
    refresh() { throw new Error('Moving the selected area must not rebuild the editor'); },
    run: async action => {
      try {
        return await action();
      } catch (error) {
        errors.push(error);
      }
    },
    reload() {
      throw new Error('Moving an area must not reload all data');
    },
    byId() {
      throw new Error('Moving an area must not set the page busy');
    }
  };
  const controller = new Editor(app);
  app.controllers.FloorEditor = controller;
  return { controller, object, errors, painted, fields, listeners };
}

test('geometry updates immediately and saves serialize and coalesce rapid changes', async () => {
  const first = deferred(),
    requests = [];
  const { controller, object, fields, listeners } = editor(async (_entity, _id, geometry) => {
    requests.push({ ...geometry });
    return requests.length === 1 ? first.promise : geometry;
  });
  controller.savePlanGeometry('area', { ...object, x: 40 });
  const saving = controller.app.runtime.planGeometrySave;
  controller.savePlanGeometry('area', { ...object, x: 60 });
  controller.savePlanGeometry('area', { ...object, x: 90, width: 140 });
  assert.equal(object.x, 90);
  assert.equal(fields.x, '90');
  assert.equal(fields.width, '140');
  assert.equal(requests.length, 1);
  assert.ok(listeners.has('beforeunload'));
  let navigated = false;
  controller.discardPlan(() => {
    navigated = true;
  });
  assert.equal(navigated, false);
  first.resolve(requests[0]);
  await saving;
  await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].x, 90);
  assert.equal(requests[1].width, 140);
  assert.equal(object.x, 90);
  assert.equal(controller.model.planDraft.x, 90);
  assert.equal(navigated, true);
  assert.equal(listeners.size, 0);
  assert.equal(controller.app.runtime.planGeometrySave, null);
});

test('a failed later save restores the most recent acknowledged position and reports the error', async () => {
  const first = deferred(),
    second = deferred(),
    requests = [];
  const { controller, object, errors, fields } = editor(async (_entity, _id, geometry) => {
    requests.push({ ...geometry });
    return requests.length === 1 ? first.promise : second.promise;
  });
  controller.savePlanGeometry('area', { ...object, x: 40 });
  controller.savePlanGeometry('area', { ...object, x: 90 });
  const saving = controller.app.runtime.planGeometrySave;
  first.resolve(requests[0]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  second.reject(new Error('networkError'));
  await saving;
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'networkError');
  assert.equal(object.x, 40);
  assert.equal(fields.x, '40');
  assert.equal(controller.app.runtime.planGeometryPending.size, 0);
});

test('queued geometry is not sent after the authenticated profile changes', async () => {
  const first = deferred(),
    requests = [];
  const { controller, object } = editor(async (_entity, _id, geometry) => {
    requests.push(geometry);
    return first.promise;
  });
  controller.savePlanGeometry('area', { ...object, x: 40 });
  controller.savePlanGeometry('area', { ...object, x: 90 });
  const saving = controller.app.runtime.planGeometrySave;
  controller.model.authEpoch++;
  first.resolve(requests[0]);
  await saving;
  assert.equal(requests.length, 1);
  assert.equal(controller.app.runtime.planGeometryPending.size, 0);
});
