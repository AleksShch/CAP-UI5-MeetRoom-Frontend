sap.ui.define(
  ['rsvroom/service/Notifications', 'rsvroom/model/Geometry', 'rsvroom/model/AreaName'],
  function (U, G, nextAreaName) {
    'use strict';
    const properties = [
      'name',
      'type',
      'resource_ID',
      'x',
      'y',
      'width',
      'height',
      'radius',
      'color',
      'opacity'
    ];
    const geometryProperties = ['x', 'y', 'width', 'height', 'radius'];
    return class FloorEditorController {
      constructor(app) {
        this.app = app;
        this.model = app.model;
      }
      openFloorEditor(id) {
        if (!this.model.isAdmin()) {
          U.MessageBox.error(this.model.t('accessDenied'));
          return;
        }
        const locations = this.model.planEditorLocations(),
          locationID =
            id ||
            (locations.some(row => row.ID === this.model.filters.floor)
              ? this.model.filters.floor
              : locations[0]?.ID);
        this.app.nav('planEditor', locationID ? { id: locationID } : {});
      }

      discardPlan(action, waitForSaves = true) {
        if (this.model.planSaving) return;
        const saving = this.app.runtime.planCreateSave || this.app.runtime.planGeometrySave;
        if (waitForSaves && saving) {
          saving.then(() => this.app.controllers.FloorEditor.discardPlan(action));
          return;
        }
        if (!this.model.planDirty) {
          action();
          return;
        }
        U.MessageBox.confirm(this.model.t('discardChanges'), {
          onClose: answer => {
            if (answer === U.MessageBox.Action.OK) {
              this.app.controls.planCanvas?.previewRadius(this.model.planObjectID, null);
              this.model.planDirty = false;
              this.model.planDraft = null;
              action();
            } else this.app.refresh();
          }
        });
      }

      planMutation(action) {
        if (this.model.planSaving) return;
        return this.app.run(async () => {
          this.model.planSaving = true;
          try {
            await Promise.all([this.app.runtime.planGeometrySave, this.app.runtime.planCreateSave]);
            this.app.byId('main').setBusy(true);
            await action();
            await this.app.reload();
          } finally {
            this.model.planSaving = false;
            this.app.byId('main').setBusy(false);
          }
        });
      }

      applyPlanGeometry(object, geometry) {
        Object.assign(object, geometry);
        this.app.controls.planCanvas?.applyGeometry(object.ID, geometry);
        this.app.controls.planObjectSelector
          ?.getItems()
          .find(item => item.getKey() === object.ID)
          ?.setText(object.name);
        if (this.model.planObjectID === object.ID && !this.model.planDirty) {
          Object.assign(this.model.planDraft || {}, geometry);
          for (const key of Object.keys(geometry))
            this.app.controls.planGeometryFields?.[key]?.setValue(String(geometry[key]));
        }
        if (this.model.planObjectID === object.ID) {
          this.app.controls.planConfigureButton?.setVisible(!object.resource_ID);
          if (this.model.planDirty && Number.isFinite(this.model.planDraft?.radius))
            this.app.controls.planCanvas?.previewRadius(
              object.ID,
              Math.max(0, this.model.planDraft.radius)
            );
        }
      }

      savePlanGeometry(id, rectangle) {
        return this.app.controllers.FloorEditor.savePlanObject(
          id,
          Object.fromEntries(geometryProperties.map(key => [key, rectangle[key]]))
        );
      }

      savePlanObject(id, geometry, propertySave = false) {
        if (this.model.planSaving) return;
        const object = this.model.maps.FloorObjects[id];
        if (!object) return;
        this.app.runtime.planGeometryPending = this.app.runtime.planGeometryPending || new Map();
        let entry = this.app.runtime.planGeometryPending.get(id);
        if (!entry) {
          entry = { object, confirmed: { ...object }, revision: 0 };
          this.app.runtime.planGeometryPending.set(id, entry);
        }
        entry.geometry = { ...entry.geometry, ...geometry };
        entry.revision++;
        entry.propertySave = entry.propertySave || propertySave;
        this.app.controllers.FloorEditor.applyPlanGeometry(object, geometry);
        if (this.model.planObjectID !== id) {
          this.model.planObjectID = id;
          this.app.refresh();
        }
        if (this.app.runtime.planGeometrySave) return this.app.runtime.planGeometrySave;
        const epoch = this.model.authEpoch;
        const preventClose = event => {
          event.preventDefault();
          event.returnValue = '';
        };
        window.addEventListener('beforeunload', preventClose);
        this.app.runtime.planGeometrySave = this.app
          .run(async () => {
            try {
              while (this.app.runtime.planGeometryPending.size && epoch === this.model.authEpoch) {
                const [objectID, pending] = this.app.runtime.planGeometryPending
                  .entries()
                  .next().value;
                const { geometry, revision } = pending;
                const saved = await this.model.api.update('FloorObjects', objectID, geometry);
                const confirmed = Object.fromEntries(
                  Object.keys(geometry).map(key => [
                    key,
                    saved && Object.hasOwn(saved, key) ? saved[key] : geometry[key]
                  ])
                );
                Object.assign(pending.confirmed, confirmed);
                if (pending.revision === revision) {
                  this.app.runtime.planGeometryPending.delete(objectID);
                  this.app.controllers.FloorEditor.applyPlanGeometry(pending.object, confirmed);
                }
              }
              this.app.runtime.planGeometryPending.clear();
              return epoch === this.model.authEpoch;
            } catch (error) {
              // Restore the last acknowledged geometry when a save fails.
              if (epoch === this.model.authEpoch) {
                this.app.controls.planCanvas?.cancelInteraction();
                for (const pending of this.app.runtime.planGeometryPending.values()) {
                  if (pending.propertySave && this.model.planObjectID === pending.object.ID)
                    this.model.planDirty = true;
                  this.app.controllers.FloorEditor.applyPlanGeometry(
                    pending.object,
                    pending.confirmed
                  );
                }
              }
              this.app.runtime.planGeometryPending.clear();
              throw error;
            }
          })
          .finally(() => {
            this.app.runtime.planGeometrySave = null;
            window.removeEventListener('beforeunload', preventClose);
          });
        return this.app.runtime.planGeometrySave;
      }

      clearBackground(floor) {
        return this.app.controllers.FloorEditor.discardPlan(() =>
          U.MessageBox.confirm(this.model.t('removeBackgroundConfirm'), {
            onClose: answer => {
              if (answer === U.MessageBox.Action.OK)
                this.app.controllers.FloorEditor.planMutation(async () => {
                  await this.model.api.update('Floors', floor.ID, {
                    planImage: null,
                    planImageName: null,
                    floorPlan: null
                  });
                });
            }
          })
        );
      }

      createPlanObject(floor, rectangle) {
        if (this.model.planSaving) return;
        this.app.runtime.planCreatePending = this.app.runtime.planCreatePending || [];
        this.app.runtime.planCreatePending.push({
          floor,
          rectangle: { ...rectangle },
          selection: this.model.planObjectID
        });
        if (this.app.runtime.planCreateSave) return this.app.runtime.planCreateSave;
        const epoch = this.model.authEpoch;
        const preventClose = event => {
          event.preventDefault();
          event.returnValue = '';
        };
        window.addEventListener('beforeunload', preventClose);
        this.app.runtime.planCreateSave = this.app
          .run(async () => {
            try {
              // Serialize drawings so each area receives the next available name.
              while (this.app.runtime.planCreatePending.length && epoch === this.model.authEpoch) {
                const { floor, rectangle, selection } = this.app.runtime.planCreatePending[0];
                const name = await this.app.controllers.FloorEditor.planObjectName(floor);
                if (epoch !== this.model.authEpoch) break;
                const object = await this.model.api.create('FloorObjects', {
                  floor_ID: floor.ID,
                  type: 'ZONE',
                  ...rectangle,
                  radius: Math.min(12, rectangle.width / 2, rectangle.height / 2),
                  color: '#0064d9',
                  opacity: 0.25,
                  ...name
                });
                if (epoch !== this.model.authEpoch) break;
                this.model.data.FloorObjects.push(object);
                this.model.maps.FloorObjects[object.ID] = object;
                this.app.runtime.planCreatePending.shift();
                this.model.planCreated = { object, selection };
                this.app.controllers.FloorEditor.renderCreatedPlanObjects();
              }
            } finally {
              this.app.runtime.planCreatePending.length = 0;
              if (epoch === this.model.authEpoch)
                this.app.controllers.FloorEditor.renderCreatedPlanObjects();
              else this.model.planCreated = null;
            }
          })
          .finally(() => {
            this.app.runtime.planCreateSave = null;
            window.removeEventListener('beforeunload', preventClose);
          });
        return this.app.runtime.planCreateSave;
      }

      renderCreatedPlanObjects() {
        if (
          !this.model.planCreated ||
          this.app.runtime.planCreatePending.length ||
          this.app.controls.planCanvas?.isInteracting()
        )
          return;
        const { object, selection } = this.model.planCreated;
        this.model.planCreated = null;
        if (
          this.model.planFloorID !== object.floor_ID ||
          !(
            this.model.route === 'planEditor' ||
            (this.model.route === 'admin' && this.model.adminEntity === 'Plans')
          )
        )
          return;
        if (!this.model.planDirty && this.model.planObjectID === selection)
          this.model.planObjectID = object.ID;
        // A response must not replace the canvas in the middle of the next gesture.
        this.app.refresh();
      }

      async planObjectName(floor) {
        if (window.RSVROOM_CONFIG?.serverAreaNames !== false) return {};
        const areas = await this.model.api.list('FloorObjects', {
          $filter: `floor_ID eq '${floor.ID}'`,
          $select: 'name'
        });
        return {
          name: nextAreaName(this.model.maps.Buildings[floor.building_ID]?.name, floor.name, areas)
        };
      }

      savePlanProperties(selected) {
        if (this.model.planSaving) return;
        const draft = this.model.planDraft,
          maxRadius = Math.min(selected.width, selected.height) * 2;
        if (!draft.name.trim()) {
          U.MessageBox.error(this.model.t('checkRequired'));
          return;
        }
        if (!Number.isFinite(draft.radius) || draft.radius < 0) {
          U.MessageBox.error(this.model.t('invalidCornerRadius', [maxRadius]));
          return;
        }
        this.model.planDirty = false;
        this.app.controls.planCanvas.previewRadius(selected.ID, null);
        return this.app.controllers.FloorEditor.savePlanObject(
          selected.ID,
          Object.fromEntries(
            ['name', 'type', 'resource_ID', 'radius'].map(key => [key, draft[key] ?? null])
          ),
          true
        ).then(saved => {
          if (saved) U.MessageToast.show(this.model.t('saved'));
        });
      }

      saveAreaBooking({ selector, name, code, area, type, capacity, save, dialog }) {
        return this.app.run(async () => {
          let resource = this.model.maps.Resources[selector.getSelectedKey()];
          const operations = [];
          if (!resource) {
            if (!name.getValue().trim() || !code.getValue().trim())
              throw new Error('checkRequired');
            resource = {
              ID: crypto.randomUUID(),
              floor_ID: area.floor_ID,
              name: name.getValue().trim(),
              code: code.getValue().trim(),
              type: type.getSelectedKey(),
              capacity: type.getSelectedKey() === 'ROOM' ? capacity.getValue() : 1,
              active: true
            };
            operations.push({ method: 'POST', url: 'Resources', body: resource });
          }
          operations.push({
            method: 'PATCH',
            url: `FloorObjects(${area.ID})`,
            body: {
              resource_ID: resource.ID,
              type:
                area.type === 'ZONE' && resource.type === 'WORKPLACE'
                  ? 'ZONE'
                  : this.model.resourceObjectType(resource)
            },
            ...(operations.length ? { dependsOn: ['1'] } : {})
          });
          save.setEnabled(false);
          try {
            await this.model.api.batch(operations);
            this.model.selectedID = resource.ID;
            this.model.selectedAreaID = null;
            this.model.planDirty = false;
            this.model.planDraft = null;
            this.model.filters.capacity = 1;
            this.model.filters.equipment = [];
            dialog.close();
            await this.app.reload();
            if (!['planEditor', 'admin'].includes(this.model.route))
              this.app.nav(this.model.resourceSection(resource));
            U.MessageToast.show(this.model.t('areaBookingReady'));
          } finally {
            save.setEnabled(true);
          }
        });
      }

      removePlanObject(object) {
        if (!object) return;
        this.app.controllers.FloorEditor.discardPlan(() =>
          U.MessageBox.confirm(this.model.t('deleteAreaConfirm'), {
            onClose: answer => {
              if (answer === U.MessageBox.Action.OK)
                this.app.controllers.FloorEditor.planMutation(async () => {
                  await this.model.api.remove('FloorObjects', object.ID);
                  this.model.planObjectID = null;
                  this.model.planDraft = null;
                });
            }
          })
        );
      }

      duplicatePlanObject(floor, object) {
        if (!object) return;
        this.app.controllers.FloorEditor.discardPlan(() =>
          this.app.controllers.FloorEditor.planMutation(async () => {
            const copy = G.move(object, 20, 20, {
              width: floor.planWidth,
              height: floor.planHeight
            });
            const created = await this.model.api.create('FloorObjects', {
              ...Object.fromEntries(
                properties.filter(key => key !== 'name').map(key => [key, copy[key] ?? null])
              ),
              floor_ID: floor.ID,
              resource_ID: null,
              ...(await this.app.controllers.FloorEditor.planObjectName(floor))
            });
            this.model.planObjectID = created.ID;
          })
        );
      }

      uploadFloorImage(floor, file) {
        return this.app.controllers.FloorEditor.planMutation(async () => {
          let payload;
          if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
            if (file.size > 1000000) throw new Error('svgError');
            const svg = await file.text(),
              xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
            if (
              xml.querySelector('parsererror') ||
              xml.documentElement.localName !== 'svg' ||
              xml.querySelector('script,foreignObject')
            )
              throw new Error('svgError');
            const box = xml.documentElement
              .getAttribute('viewBox')
              ?.trim()
              .split(/[ ,]+/)
              .map(Number);
            payload = {
              floorPlan: svg,
              planImage: null,
              planImageName: file.name,
              planWidth: Math.round(
                box?.[2] || parseFloat(xml.documentElement.getAttribute('width')) || 1000
              ),
              planHeight: Math.round(
                box?.[3] || parseFloat(xml.documentElement.getAttribute('height')) || 600
              )
            };
          } else {
            if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type))
              throw new Error('imageUploadError');
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('imageUploadError'));
              reader.readAsDataURL(file);
            });
            const image = await new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error('imageUploadError'));
              img.src = dataUrl;
            });
            if (
              image.naturalWidth < 100 ||
              image.naturalHeight < 100 ||
              image.naturalWidth > 10000 ||
              image.naturalHeight > 10000
            )
              throw new Error('imageDimensionsError');
            payload = {
              planImage: dataUrl,
              planImageName: file.name,
              floorPlan: null,
              planWidth: image.naturalWidth,
              planHeight: image.naturalHeight
            };
          }
          await this.model.api.update('Floors', floor.ID, payload);
          delete this.model.planViews[floor.ID];
          U.MessageToast.show(this.model.t('saved'));
        });
      }
    };
  }
);
