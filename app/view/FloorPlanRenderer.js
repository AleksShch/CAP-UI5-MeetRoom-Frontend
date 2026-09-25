sap.ui.define(['rsvroom/model/i18n'], function (I18n) {
  'use strict';
  const t = (key, args) => I18n.text(I18n.language(), key, args);
  const colors = {
    available: '#0064d9',
    reserved: '#c74c44',
    mine: '#367cb5',
    unavailable: '#8993a1',
    restricted: '#806994',
    soon: '#ba8d20'
  };
  const objectColor = object =>
    object.missingCoordinates
      ? '#c74c44'
      : colors[object.availability] ||
        (object.color?.toLowerCase() === '#3c7967' ? '#0064d9' : object.color) ||
        '#0064d9';

  return {
    objectColor,
    apiVersion: 2,
    render: function (rm, c) {
      if (c.getViewState()) {
        c.mode = c.getViewState().mode || 'select';
        c.grid = !!c.getViewState().grid;
      }
      if (!c.getEditing()) {
        c.mode = 'pan';
        c.grid = false;
      }
      rm.openStart('div', c).class('floorCanvas').class('interactivePlan').openEnd();
      rm.openStart('div')
        .class('planTools')
        .attr('role', 'toolbar')
        .attr('aria-label', t('mapTools'))
        .openEnd();
      const button = (action, key, symbol) => {
        rm.openStart('button')
          .attr('type', 'button')
          .attr('data-action', action)
          .attr('title', t(key))
          .attr('aria-label', t(key));
        if (['select', 'pan', 'draw'].includes(action))
          rm.attr('aria-pressed', c.mode === action ? 'true' : 'false');
        if (action === 'grid') rm.attr('aria-pressed', String(c.grid));
        rm.openEnd()
          .text(symbol || t(key))
          .close('button');
      };
      if (c.getEditing()) {
        button('select', 'selectTool');
        button('pan', 'panTool');
        button('draw', 'drawArea');
      }
      button('out', 'zoomOut', '−');
      rm.openStart('span')
        .class('planZoom')
        .attr('aria-live', 'polite')
        .openEnd()
        .text('100%')
        .close('span');
      button('in', 'zoomIn', '+');
      button('fit', 'fitPlan');
      button('reset', 'resetZoom');
      if (c.getEditing()) button('grid', 'snapGrid');
      rm.close('div');
      rm.openStart('div')
        .class('planViewport')
        .attr('tabindex', 0)
        .attr('aria-label', c.getLabel() || t('plan'))
        .openEnd();
      rm.openStart('svg')
        .class('planWorld')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('viewBox', `0 0 ${c.getPlanWidth()} ${c.getPlanHeight()}`)
        .attr('width', c.getPlanWidth())
        .attr('height', c.getPlanHeight())
        .style('width', c.getPlanWidth() + 'px')
        .style('height', c.getPlanHeight() + 'px')
        .openEnd();
      rm.openStart('rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', '#f7faff')
        .openEnd()
        .close('rect');
      const href =
        c.getImage() ||
        (c.getPlan() ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(c.getPlan()) : '');
      if (href)
        rm.openStart('image')
          .attr('href', href)
          .attr('width', c.getPlanWidth())
          .attr('height', c.getPlanHeight())
          .attr('preserveAspectRatio', 'none')
          .openEnd()
          .close('image');
      else
        rm.openStart('rect')
          .attr('x', 1)
          .attr('y', 1)
          .attr('width', c.getPlanWidth() - 2)
          .attr('height', c.getPlanHeight() - 2)
          .attr('fill', 'none')
          .attr('stroke', '#c8d7e8')
          .openEnd()
          .close('rect');
      const gridId = c.getId() + '-grid';
      rm.openStart('defs')
        .openEnd()
        .openStart('pattern')
        .attr('id', gridId)
        .attr('width', 10)
        .attr('height', 10)
        .attr('patternUnits', 'userSpaceOnUse')
        .openEnd()
        .openStart('path')
        .attr('d', 'M 10 0 L 0 0 0 10')
        .attr('fill', 'none')
        .attr('stroke', '#7c93ae')
        .attr('stroke-width', 0.5)
        .openEnd()
        .close('path')
        .close('pattern')
        .close('defs');
      rm.openStart('rect')
        .class('planGrid')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', `url(#${gridId})`)
        .attr('pointer-events', 'none')
        .attr('visibility', c.grid ? 'visible' : 'hidden')
        .openEnd()
        .close('rect');
      // Bookable resources stay above independent areas, including overlapping copies.
      const layer = object =>
        !c.getEditing() && object.resource_ID ? 2 : object.type === 'ZONE' ? 0 : 1;
      c._items()
        .sort((a, b) => layer(a) - layer(b))
        .forEach(object => {
          const selected = c.getEditing()
              ? object.ID === c.getSelected()
              : object.resource_ID
                ? object.resource_ID === c.getSelected()
                : object.ID === c.getSelectedObject(),
            color = objectColor(object);
          rm.openStart('g')
            .class('planObject')
            .attr('data-object', object.ID)
            .attr('transform', `translate(${object.x},${object.y})`);
          rm.attr('role', 'button')
            .attr('tabindex', 0)
            .attr('aria-label', object.name + (object.statusText ? ', ' + object.statusText : ''))
            .attr('aria-pressed', String(selected));
          rm.openEnd();
          rm.openStart('title')
            .openEnd()
            .text(object.name + (object.statusText ? ' · ' + object.statusText : ''))
            .close('title');
          rm.openStart('rect')
            .class('objectShape')
            .attr('width', object.width)
            .attr('height', object.height)
            .attr(
              'rx',
              c.getRadiusPreview()?.ID === object.ID ? c.getRadiusPreview().radius : object.radius
            )
            .attr('fill', color)
            .attr('fill-opacity', object.missingCoordinates ? 0.25 : object.opacity)
            .attr('stroke', selected && !object.missingCoordinates ? '#0064d9' : color)
            .attr('stroke-width', selected ? 3 : 1.5)
            .attr('vector-effect', 'non-scaling-stroke')
            .openEnd()
            .close('rect');
          rm.openStart('svg')
            .attr('width', object.width)
            .attr('height', object.height)
            .style('width', object.width + 'px')
            .style('height', object.height + 'px')
            .attr('pointer-events', 'none')
            .openEnd();
          rm.openStart('text')
            .attr('x', 8)
            .attr('y', 21)
            .attr('font-size', 14)
            .attr('font-weight', 600)
            .attr('fill', '#153b65')
            .openEnd()
            .text(object.name)
            .close('text');
          if (object.statusText)
            rm.openStart('text')
              .attr('x', 8)
              .attr('y', 40)
              .attr('font-size', 12)
              .attr('fill', color)
              .openEnd()
              .text(object.statusText)
              .close('text');
          rm.close('svg');
          if (selected && c.getEditing())
            for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
              const x = handle.includes('w')
                  ? 0
                  : handle.includes('e')
                    ? object.width
                    : object.width / 2,
                y = handle.includes('n')
                  ? 0
                  : handle.includes('s')
                    ? object.height
                    : object.height / 2;
              rm.openStart('rect')
                .attr('data-handle', handle)
                .attr('x', x - 5)
                .attr('y', y - 5)
                .attr('width', 10)
                .attr('height', 10)
                .attr('fill', '#fff')
                .attr('stroke', '#0064d9')
                .style('cursor', handle + '-resize')
                .openEnd()
                .close('rect');
            }
          rm.close('g');
        });
      rm.openStart('rect')
        .class('planPreview')
        .attr('fill', '#0064d9')
        .attr('fill-opacity', 0.2)
        .attr('stroke', '#0064d9')
        .attr('visibility', 'hidden')
        .attr('pointer-events', 'none')
        .openEnd()
        .close('rect');
      rm.close('svg').close('div').close('div');
    }
  };
});
