sap.ui.define(
  [
    'sap/ui/core/Control',
    'rsvroom/model/Geometry',
    'rsvroom/model/FloorPlanItems',
    'rsvroom/view/FloorPlanRenderer'
  ],
  function (Control, G, floorPlanItems, FloorPlanRenderer) {
    'use strict';
    return Control.extend('rsvroom.control.FloorPlan', {
      metadata: {
        properties: {
          resources: { type: 'object', defaultValue: [] },
          objects: { type: 'object', defaultValue: [] },
          objectTypes: { type: 'object', defaultValue: [] },
          plan: { type: 'string', defaultValue: '' },
          image: { type: 'string', defaultValue: '' },
          planWidth: { type: 'int', defaultValue: 1000 },
          planHeight: { type: 'int', defaultValue: 600 },
          selected: { type: 'string', defaultValue: '' },
          selectedObject: { type: 'string', defaultValue: '' },
          editing: { type: 'boolean', defaultValue: false },
          label: { type: 'string', defaultValue: '' },
          viewState: { type: 'object', defaultValue: null },
          radiusPreview: { type: 'object', defaultValue: null }
        },
        events: {
          select: {
            parameters: {
              id: { type: 'string' },
              resourceId: { type: 'string' },
              objectId: { type: 'string' }
            }
          },
          create: { parameters: { rectangle: { type: 'object' } } },
          change: { parameters: { id: { type: 'string' }, rectangle: { type: 'object' } } },
          remove: {},
          duplicate: {},
          interactionEnd: {},
          viewport: { parameters: { view: { type: 'object' } } }
        }
      },
      init: function () {
        this.mode = 'select';
        this.grid = false;
        this._space = false;
      },
      _items: function () {
        return floorPlanItems(
          this.getResources(),
          this.getObjects(),
          this.getObjectTypes(),
          this.getEditing()
        );
      },
      renderer: FloorPlanRenderer,
      onBeforeRendering: function () {
        this._detach();
      },
      onAfterRendering: function () {
        const el = this.getDomRef(),
          viewport = el.querySelector('.planViewport');
        this._view =
          this.getViewState() ||
          this._view ||
          G.fit(this._bounds(), { width: viewport.clientWidth, height: viewport.clientHeight });
        this._applyView();
        this._abort = new AbortController();
        const options = { signal: this._abort.signal };
        viewport.addEventListener('pointerdown', event => this._down(event), options);
        viewport.addEventListener('pointermove', event => this._move(event), options);
        viewport.addEventListener('pointerup', event => this._up(event), options);
        viewport.addEventListener('pointercancel', () => this._cancel(), options);
        viewport.addEventListener(
          'wheel',
          event => {
            if (!event.shiftKey || this._drag) return;
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
            this._zoom(this._view.zoom * factor, this._screen(event));
          },
          { ...options, passive: false }
        );
        viewport.addEventListener(
          'blur',
          () => {
            this._space = false;
          },
          options
        );
        this._resize = new ResizeObserver(() => {
          if (this._fitted) this.fit();
        });
        this._resize.observe(viewport);
      },
      exit: function () {
        this._detach();
      },
      _detach: function () {
        this._abort?.abort();
        this._resize?.disconnect();
      },
      _bounds: function () {
        return { width: this.getPlanWidth(), height: this.getPlanHeight() };
      },
      _screen: function (event) {
        const box = this.getDomRef().querySelector('.planViewport').getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
      },
      _applyView: function () {
        const el = this.getDomRef();
        if (!el) return;
        el.querySelector('.planWorld').style.transform =
          `translate(${this._view.panX}px,${this._view.panY}px) scale(${this._view.zoom})`;
        el.querySelector('.planZoom').textContent = Math.round(this._view.zoom * 100) + '%';
        this.fireViewport({ view: { ...this._view, mode: this.mode, grid: this.grid } });
      },
      _zoom: function (zoom, anchor) {
        const viewport = this.getDomRef().querySelector('.planViewport');
        this._fitted = false;
        this._view = G.zoomAt(
          this._view,
          G.clamp(zoom, 0.02, 5),
          anchor || { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
        );
        this._applyView();
      },
      fit: function () {
        const viewport = this.getDomRef().querySelector('.planViewport');
        this._fitted = true;
        this._view = G.fit(this._bounds(), {
          width: viewport.clientWidth,
          height: viewport.clientHeight
        });
        this._applyView();
      },
      onclick: function (event) {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (['select', 'pan', 'draw'].includes(action)) {
          this.mode = action;
          this.getDomRef()
            .querySelectorAll('[data-action]')
            .forEach(el => {
              if (['select', 'pan', 'draw'].includes(el.dataset.action))
                el.setAttribute('aria-pressed', String(el.dataset.action === action));
            });
        } else if (action === 'fit') this.fit();
        else if (action === 'reset') {
          this._view = { zoom: 1, panX: 0, panY: 0 };
          this._fitted = false;
          this._applyView();
        } else if (action === 'in' || action === 'out')
          this._zoom(this._view.zoom * (action === 'in' ? 1.25 : 0.8));
        else if (action === 'grid') {
          this.grid = !this.grid;
          event.target.setAttribute('aria-pressed', String(this.grid));
          this.getDomRef()
            .querySelector('.planGrid')
            .setAttribute('visibility', this.grid ? 'visible' : 'hidden');
        }
        this._applyView();
      },
      _down: function (event) {
        if (this._drag || (event.button !== 0 && event.button !== 1)) return;
        event.preventDefault();
        const viewport = this.getDomRef().querySelector('.planViewport');
        viewport.focus({ preventScroll: true });
        viewport.setPointerCapture(event.pointerId);
        const screen = this._screen(event),
          point = G.point(screen, this._view),
          node = event.target.closest('[data-object]'),
          object = this._items().find(row => row.ID === node?.dataset.object),
          handle = event.target.dataset.handle;
        const kind =
          this.mode === 'pan' || this._space || event.button === 1
            ? 'pan'
            : this.getEditing() && this.mode === 'draw'
              ? 'draw'
              : object
                ? this.getEditing()
                  ? handle
                    ? 'resize'
                    : 'move'
                  : 'select'
                : 'pan';
        this._drag = {
          kind,
          screen,
          point,
          object,
          handle,
          node,
          view: { ...this._view },
          moved: false,
          selectOnClick: !this.getEditing() && event.button === 0 && !this._space
        };
      },
      _move: function (event) {
        const drag = this._drag;
        if (!drag) return;
        const screen = this._screen(event),
          point = G.point(screen, this._view),
          dx = point.x - drag.point.x,
          dy = point.y - drag.point.y;
        if (Math.hypot(screen.x - drag.screen.x, screen.y - drag.screen.y) > 3) drag.moved = true;
        if (drag.kind === 'pan') {
          this._fitted = false;
          this._view = {
            ...drag.view,
            panX: drag.view.panX + screen.x - drag.screen.x,
            panY: drag.view.panY + screen.y - drag.screen.y
          };
          this._applyView();
          return;
        }
        if (!drag.moved || drag.kind === 'select') return;
        const grid = this.grid ? 10 : 0;
        drag.rectangle =
          drag.kind === 'draw'
            ? G.rectangle(drag.point, point, this._bounds(), grid)
            : drag.kind === 'resize'
              ? G.resize(drag.object, drag.handle, dx, dy, this._bounds(), grid)
              : G.move(drag.object, dx, dy, this._bounds(), grid);
        const rect = drag.rectangle,
          preview = this.getDomRef().querySelector('.planPreview');
        for (const key of ['x', 'y', 'width', 'height']) preview.setAttribute(key, rect[key]);
        preview.setAttribute('rx', rect.radius || 0);
        preview.setAttribute('visibility', 'visible');
      },
      _up: function (event) {
        const drag = this._drag;
        if (!drag) return;
        this._drag = null;
        this.getDomRef().querySelector('.planPreview').setAttribute('visibility', 'hidden');
        const viewport = this.getDomRef().querySelector('.planViewport');
        if (viewport.hasPointerCapture(event.pointerId))
          viewport.releasePointerCapture(event.pointerId);
        if (drag.rectangle && drag.moved) {
          if (drag.kind === 'draw') {
            if (drag.rectangle.width >= 4 && drag.rectangle.height >= 4)
              this.fireCreate({ rectangle: drag.rectangle });
          } else this.fireChange({ id: drag.object.ID, rectangle: drag.rectangle });
        } else if (drag.object && !drag.moved && (drag.kind !== 'pan' || drag.selectOnClick))
          this._selectObject(drag.object);
        this.fireInteractionEnd();
      },
      // UI5 replaces an empty event "id" with the control ID. Keep the optional
      // resource reference separate so an independent area cannot select a control.
      _selectObject: function (object) {
        if (object)
          this.fireSelect({
            id: (this.getEditing() ? object.ID : object.resource_ID) || object.ID,
            resourceId: object.resource_ID || '',
            objectId: object.ID
          });
      },
      _cancel: function () {
        this._drag = null;
        this.getDomRef()?.querySelector('.planPreview').setAttribute('visibility', 'hidden');
        this.fireInteractionEnd();
      },
      isInteracting: function () {
        return !!this._drag;
      },
      cancelInteraction: function () {
        this._cancel();
      },
      previewRadius: function (id, radius) {
        this.setProperty('radiusPreview', radius === null ? null : { ID: id, radius }, true);
        const object = this.getObjects().find(row => row.ID === id);
        const node = Array.from(this.getDomRef()?.querySelectorAll('[data-object]') || []).find(
          node => node.dataset.object === id
        );
        if (object && node)
          node
            .querySelector('.objectShape')
            .setAttribute('rx', radius === null ? object.radius : radius);
      },
      applyGeometry: function (id, geometry) {
        const stored = this.getObjects().find(row => row.ID === id);
        if (!stored) return;
        Object.assign(stored, geometry);
        const object = this._items().find(row => row.ID === id);
        if (!object) return;
        const node = Array.from(this.getDomRef()?.querySelectorAll('[data-object]') || []).find(
          node => node.dataset.object === id
        );
        if (!node) return;
        node.setAttribute('transform', `translate(${object.x},${object.y})`);
        const shape = node.querySelector('.objectShape');
        const color = FloorPlanRenderer.objectColor(object);
        shape.setAttribute('fill', color);
        shape.setAttribute('fill-opacity', object.missingCoordinates ? 0.25 : object.opacity);
        shape.setAttribute(
          'stroke',
          node.getAttribute('aria-pressed') === 'true' && !object.missingCoordinates
            ? '#0064d9'
            : color
        );
        for (const key of ['width', 'height']) shape.setAttribute(key, object[key]);
        shape.setAttribute(
          'rx',
          this.getRadiusPreview()?.ID === id ? this.getRadiusPreview().radius : object.radius
        );
        const label = node.querySelector('svg');
        if (Object.hasOwn(geometry, 'name')) {
          node.setAttribute('aria-label', object.name);
          node.querySelector('title').textContent = object.name;
          label.querySelector('text').textContent = object.name;
        }
        for (const key of ['width', 'height']) {
          label.setAttribute(key, object[key]);
          label.style[key] = object[key] + 'px';
        }
        for (const handle of node.querySelectorAll('[data-handle]')) {
          const direction = handle.dataset.handle;
          handle.setAttribute(
            'x',
            (direction.includes('w')
              ? 0
              : direction.includes('e')
                ? object.width
                : object.width / 2) - 5
          );
          handle.setAttribute(
            'y',
            (direction.includes('n')
              ? 0
              : direction.includes('s')
                ? object.height
                : object.height / 2) - 5
          );
        }
      },
      onkeyup: function (event) {
        if (event.code === 'Space') this._space = false;
      },
      onkeydown: function (event) {
        if (event.target.closest('.planTools')) return;
        if (event.code === 'Space') {
          event.preventDefault();
          this._space = true;
          return;
        }
        if (event.key === 'Escape') {
          this._cancel();
          return;
        }
        const node = event.target.closest('[data-object]');
        if (event.key === 'Enter' && node) {
          event.preventDefault();
          this._selectObject(this._items().find(row => row.ID === node.dataset.object));
          return;
        }
        if (!this.getEditing() || !this.getSelected()) return;
        if (event.key === 'Delete') {
          event.preventDefault();
          this.fireRemove();
        }
        if (event.key.toLowerCase() === 'd' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this.fireDuplicate();
        }
        const arrows = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1]
        };
        if (arrows[event.key]) {
          event.preventDefault();
          const object = this._items().find(row => row.ID === this.getSelected());
          if (object) {
            const step = event.shiftKey || this.grid ? 10 : 1,
              delta = arrows[event.key];
            this.fireChange({
              id: object.ID,
              rectangle: G.move(object, delta[0] * step, delta[1] * step, this._bounds())
            });
          }
        }
      }
    });
  }
);
