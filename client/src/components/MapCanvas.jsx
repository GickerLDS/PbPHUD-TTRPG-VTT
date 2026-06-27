import { useEffect, useMemo, useRef, useState } from 'react';
import { columnLabel, editorLayerRank, getTopTileAt, tileMatchesEditorLayer } from '../editorLayers.js';
import { layerRank, normalizeTile } from '../legacyTiles.js';

const DRAWING_TOOLS = new Set(['line', 'square', 'circle', 'measure', 'measure-square', 'measure-circle']);
const MEASUREMENT_TOOLS = new Set(['measure', 'measure-square', 'measure-circle']);

export function MapCanvas({
  map,
  selectedTile,
  tool,
  editorLayer,
  drawingOptions,
  drawings = [],
  backgroundImage,
  entities = [],
  selectedEntity,
  cellSize = 50,
  onPlaceTile,
  onEraseTile,
  onMoveTile,
  onAddDrawing,
  onMeasure,
  onPlaceEntity,
  onMoveEntity,
  onSelectEntity
}) {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const imageCacheRef = useRef(new Map());
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [hoverEntity, setHoverEntity] = useState(null);
  const [movePreview, setMovePreview] = useState(null);
  const [drawingPreview, setDrawingPreview] = useState(null);

  const tiles = useMemo(() => {
    return (map?.tiles || [])
      .map(normalizeTile)
      .sort((a, b) => editorLayerRank(a) - editorLayerRank(b) || layerRank(a.layer) - layerRank(b.layer));
  }, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const ctx = canvas.getContext('2d');
    const gridWidth = getGridWidth(map);
    const gridHeight = getGridHeight(map);
    const width = gridWidth * cellSize;
    const height = gridHeight * cellSize;
    canvas.width = width;
    canvas.height = height;

    let cancelled = false;

    async function render() {
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, width, height);
      await drawBackgroundImage(ctx, backgroundImage, imageCacheRef.current);
      if (cancelled) return;
      drawGrid(ctx, gridWidth, gridHeight, cellSize);

      for (const tile of tiles) {
        const image = await loadImage(tile.url, imageCacheRef.current).catch(() => null);
        if (cancelled) return;
        const px = (tile.x - 1) * cellSize;
        const py = (tile.y - 1) * cellSize;
        if (image) {
          ctx.drawImage(image, px, py, cellSize, cellSize);
        } else {
          drawMissingTile(ctx, tile.tileCode, px, py, cellSize);
        }
      }

      drawGrid(ctx, gridWidth, gridHeight, cellSize);
      for (const drawing of drawings) {
        drawShape(ctx, drawing, cellSize);
      }
      for (const entity of entities) {
        await drawEntity(ctx, entity, cellSize, imageCacheRef.current, entity.id === selectedEntity?.id);
        if (cancelled) return;
      }
      if (drawingPreview) {
        drawShape(ctx, drawingPreview, cellSize, true);
      }
      drawActiveCell(ctx, hoverCell, cellSize, '#38bdf8');
      if (movePreview) {
        drawActiveCell(ctx, { x: movePreview.fromX, y: movePreview.fromY }, cellSize, '#f97316');
        drawActiveCell(ctx, { x: movePreview.toX, y: movePreview.toY }, cellSize, '#22c55e');
      }
      if (hoverEntity) {
        drawEntityTooltip(ctx, hoverEntity.entity, hoverEntity.point, cellSize, width, height);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [backgroundImage, cellSize, drawingPreview, drawings, entities, hoverCell, hoverEntity, map, movePreview, selectedEntity, tiles]);

  if (!map) {
    return <div className="empty-state">Create or select a map to begin.</div>;
  }

  const gridWidth = getGridWidth(map);
  const gridHeight = getGridHeight(map);
  const columns = Array.from({ length: gridWidth }, (_, index) => columnLabel(index + 1));
  const rows = Array.from({ length: gridHeight }, (_, index) => index + 1);

  function handlePointerDown(event) {
    if (event.button === 1) {
      const shell = shellRef.current;
      if (!shell) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: shell.scrollLeft,
        scrollTop: shell.scrollTop
      };
      return;
    }

    const point = pointFromEvent(event, gridWidth, gridHeight, cellSize);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setHoverCell(point.cell);
    setHoverEntity(entityHoverFromPoint(entities, point));

    const requestedTool = event.button === 2 || event.altKey ? 'erase' : tool;

    if (DRAWING_TOOLS.has(requestedTool)) {
      const shape = makeShape(requestedTool, point, point, drawingOptions);
      dragRef.current = {
        type: 'drawing',
        pointerId: event.pointerId,
        tool: requestedTool,
        start: point
      };
      setDrawingPreview(shape);
      return;
    }

    if (requestedTool === 'entity') {
      const entityAtCell = getEntityAtCell(entities, point.cell.x, point.cell.y);
      if (entityAtCell) {
        onSelectEntity?.(entityAtCell.id);
        dragRef.current = {
          type: 'entity-move',
          pointerId: event.pointerId,
          entity: entityAtCell,
          fromX: entityAtCell.x,
          fromY: entityAtCell.y,
          toX: point.cell.x,
          toY: point.cell.y
        };
        setMovePreview({ fromX: entityAtCell.x, fromY: entityAtCell.y, toX: point.cell.x, toY: point.cell.y });
        return;
      }

      if (selectedEntity) {
        onPlaceEntity?.({ entityId: selectedEntity.id, x: point.cell.x, y: point.cell.y });
      }
      return;
    }

    if (requestedTool === 'move') {
      const tile = getTopTileAt(tiles, point.cell.x, point.cell.y, editorLayer);
      if (!tile || editorLayer === 'terrain') return;

      dragRef.current = {
        type: 'move',
        pointerId: event.pointerId,
        tile,
        fromX: tile.x,
        fromY: tile.y,
        toX: tile.x,
        toY: tile.y
      };
      setMovePreview({ fromX: tile.x, fromY: tile.y, toX: tile.x, toY: tile.y });
      return;
    }

    dragRef.current = {
      type: requestedTool,
      pointerId: event.pointerId,
      seen: new Set()
    };
    applyCellAction(point.cell, requestedTool);
  }

  function handlePointerMove(event) {
    const pan = panRef.current;
    if (pan?.pointerId === event.pointerId) {
      const shell = shellRef.current;
      if (!shell) return;
      event.preventDefault();
      shell.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
      shell.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
      return;
    }

    const point = pointFromEvent(event, gridWidth, gridHeight, cellSize);
    setHoverCell(point?.cell ?? null);
    setHoverEntity(point ? entityHoverFromPoint(entities, point) : null);

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !point) return;

    if (drag.type === 'drawing') {
      setDrawingPreview(makeShape(drag.tool, drag.start, point, drawingOptions));
      return;
    }

    if (drag.type === 'entity-move') {
      drag.toX = point.cell.x;
      drag.toY = point.cell.y;
      setMovePreview({ fromX: drag.fromX, fromY: drag.fromY, toX: point.cell.x, toY: point.cell.y });
      return;
    }

    if (drag.type === 'move') {
      drag.toX = point.cell.x;
      drag.toY = point.cell.y;
      setMovePreview({ fromX: drag.fromX, fromY: drag.fromY, toX: point.cell.x, toY: point.cell.y });
      return;
    }

    applyCellAction(point.cell, drag.type);
  }

  function handlePointerUp(event) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    const drag = dragRef.current;
    const point = pointFromEvent(event, gridWidth, gridHeight, cellSize);
    dragRef.current = null;

    if (drag?.type === 'drawing' && point) {
      const shape = makeShape(drag.tool, drag.start, point, drawingOptions);
      const distancePx = Math.hypot((shape.end.x - shape.start.x) * cellSize, (shape.end.y - shape.start.y) * cellSize);
      if (distancePx > 3) {
        const label = measurementLabel(shape);
      if (shape.measurement) {
        onMeasure?.(label);
      } else {
          onAddDrawing?.({
            ...shape,
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`
          });
        }
      }
    }

    if (drag?.type === 'move' && (drag.fromX !== drag.toX || drag.fromY !== drag.toY)) {
      onMoveTile?.({
        tile: drag.tile,
        toX: drag.toX,
        toY: drag.toY
      });
    }

    if (drag?.type === 'entity-move' && (drag.fromX !== drag.toX || drag.fromY !== drag.toY)) {
      onMoveEntity?.({
        entityId: drag.entity.id,
        x: drag.toX,
        y: drag.toY
      });
    }

    setDrawingPreview(null);
    setMovePreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerLeave() {
    if (panRef.current) return;
    setHoverCell(null);
    setHoverEntity(null);
  }

  function applyCellAction(cell, action) {
    const drag = dragRef.current;
    const key = `${cell.x}:${cell.y}`;
    if (drag?.seen?.has(key)) return;
    drag?.seen?.add(key);

    if (action === 'erase') {
      onEraseTile?.({ x: cell.x, y: cell.y, editorLayer });
      return;
    }

    if (selectedTile && tileMatchesEditorLayer(selectedTile, editorLayer)) {
      onPlaceTile?.({
        x: cell.x,
        y: cell.y,
        tileCode: selectedTile.code,
        layer: selectedTile.code[0],
        editorLayer
      });
    }
  }

  return (
    <div className="canvas-shell" ref={shellRef}>
      <div className="map-frame" style={{ '--cell-size': `${cellSize}px` }}>
        <div className="map-corner" aria-hidden="true" />
        <div className="column-labels" aria-hidden="true">
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        <div className="row-labels" aria-hidden="true">
          {rows.map((row) => (
            <span key={row}>{row}</span>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          className={`map-canvas ${tool === 'move' ? 'move-tool' : ''} ${tool === 'entity' ? 'entity-tool' : ''} ${DRAWING_TOOLS.has(tool) ? 'draw-tool' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
    </div>
  );
}

function getGridWidth(map) {
  return Number(map?.gridWidth || map?.gridSize || 40);
}

function getGridHeight(map) {
  return Number(map?.gridHeight || map?.gridSize || 40);
}

function pointFromEvent(event, gridWidth, gridHeight, cellSize) {
  const rect = event.currentTarget.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const width = gridWidth * cellSize;
  const height = gridHeight * cellSize;
  if (px < 0 || py < 0 || px > width || py > height) return null;

  const x = Math.min(gridWidth, Math.floor(px / cellSize) + 1);
  const y = Math.min(gridHeight, Math.floor(py / cellSize) + 1);

  return {
    x: px / cellSize,
    y: py / cellSize,
    cell: { x, y }
  };
}

function makeShape(type, startPoint, endPoint, options = {}) {
  const shapeType = type === 'measure-square' ? 'square' : type === 'measure-circle' ? 'circle' : type;
  const measurement = MEASUREMENT_TOOLS.has(type);

  return {
    type: shapeType,
    measurement,
    color: measurement ? '#f97316' : options.color || '#2563eb',
    filled: measurement ? shapeType === 'square' || shapeType === 'circle' : shapeType === 'square' || shapeType === 'circle' ? Boolean(options.filled) : false,
    start: { x: startPoint.x, y: startPoint.y },
    end: { x: endPoint.x, y: endPoint.y }
  };
}

function getEntityAtCell(entities, x, y) {
  return [...entities]
    .filter((entity) => entity.x === x && entity.y === y)
    .pop();
}

function entityHoverFromPoint(entities, point) {
  const entity = getEntityAtCell(entities, point.cell.x, point.cell.y);
  return entity ? { entity, point } : null;
}

async function drawEntity(ctx, entity, cellSize, cache, selected) {
  if (!entity.x || !entity.y) return;

  const x = (entity.x - 1) * cellSize;
  const y = (entity.y - 1) * cellSize;
  const padding = Math.max(4, Math.round(cellSize * 0.08));
  const imageX = x + padding;
  const imageY = y + padding;
  const imageSize = cellSize - padding * 2;

  ctx.save();
  ctx.fillStyle = entityFillColor(entity.type);
  ctx.fillRect(x, y, cellSize, cellSize);

  const image = entity.image ? await loadImage(entity.image, cache).catch(() => null) : null;
  if (image) {
    ctx.drawImage(image, imageX, imageY, imageSize, imageSize);
  } else {
    ctx.fillStyle = entityTokenColor(entity.type);
    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, imageSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(10, Math.round(cellSize * 0.22))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(entity.name || '?').slice(0, 2).toUpperCase(), x + cellSize / 2, y + cellSize / 2);
  }

  drawHpGauge(ctx, entity, x, y, cellSize);

  ctx.strokeStyle = selected ? '#f97316' : entityStrokeColor(entity.type);
  ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
  ctx.restore();
}

function entityFillColor(type) {
  if (type === 'mob') return 'rgba(127,29,29,0.22)';
  if (type === 'charmie') return 'rgba(88,28,135,0.22)';
  return 'rgba(30,64,175,0.22)';
}

function entityTokenColor(type) {
  if (type === 'mob') return '#991b1b';
  if (type === 'charmie') return '#7e22ce';
  return '#1d4ed8';
}

function entityStrokeColor(type) {
  if (type === 'mob') return '#ef4444';
  if (type === 'charmie') return '#c084fc';
  return '#60a5fa';
}

function drawEntityTooltip(ctx, entity, point, cellSize, canvasWidth, canvasHeight) {
  const maxHp = Math.max(1, Number(entity.maxHp) || 1);
  const hp = Math.max(0, Math.min(maxHp, Number(entity.hp) || 0));
  const ratio = hp / maxHp;
  const name = String(entity.name || 'Entity');
  const hpText = `${hp}/${maxHp}`;

  ctx.save();
  ctx.font = '12px system-ui';
  const nameWidth = ctx.measureText(name).width;
  const hpWidth = ctx.measureText(hpText).width;
  const width = Math.max(150, Math.min(280, Math.max(nameWidth, hpWidth) + 24));
  const height = 58;
  const margin = 10;
  let x = point.x * cellSize + 12;
  let y = point.y * cellSize + 12;

  if (x + width + margin > canvasWidth) x = point.x * cellSize - width - 12;
  if (y + height + margin > canvasHeight) y = point.y * cellSize - height - 12;
  x = Math.max(margin, x);
  y = Math.max(margin, y);

  ctx.fillStyle = 'rgba(15,23,42,0.94)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(ellipsize(ctx, name, width - 20), x + 10, y + 8);

  const barX = x + 10;
  const barY = y + 31;
  const barWidth = width - 20;
  const barHeight = 14;
  ctx.fillStyle = '#000000';
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(barX, barY, barWidth * ratio, barHeight);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(barX + 0.5, barY + 0.5, barWidth - 1, barHeight - 1);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hpText, barX + barWidth / 2, barY + barHeight / 2);
  ctx.restore();
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let nextText = text;
  while (nextText.length > 1 && ctx.measureText(`${nextText}...`).width > maxWidth) {
    nextText = nextText.slice(0, -1);
  }
  return `${nextText}...`;
}

function drawHpGauge(ctx, entity, x, y, cellSize) {
  const maxHp = Math.max(1, Number(entity.maxHp) || 1);
  const hp = Math.max(0, Math.min(maxHp, Number(entity.hp) || 0));
  const ratio = hp / maxHp;
  const height = Math.max(5, Math.round(cellSize * 0.12));

  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(x + 2, y + 2, cellSize - 4, height);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x + 2, y + 2, (cellSize - 4) * ratio, height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 2.5, y + 2.5, cellSize - 5, height - 1);

  if (cellSize >= 42) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${hp}/${maxHp}`, x + cellSize / 2, y + 2 + height / 2);
  }
  ctx.restore();
}

function drawGrid(ctx, gridWidth, gridHeight, cellSize) {
  const width = gridWidth * cellSize;
  const height = gridHeight * cellSize;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridWidth; i += 1) {
    const pos = i * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, height);
    ctx.stroke();
  }

  for (let i = 0; i <= gridHeight; i += 1) {
    const pos = i * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(width, pos);
    ctx.stroke();
  }
}

async function drawBackgroundImage(ctx, backgroundImage, cache) {
  if (!backgroundImage?.src) return;

  const image = await loadImage(backgroundImage.src, cache).catch(() => null);
  if (!image) return;

  const width = Number(backgroundImage.width) || image.naturalWidth || image.width;
  const height = Number(backgroundImage.height) || image.naturalHeight || image.height;
  const offsetX = Number(backgroundImage.offsetX) || 0;
  const offsetY = Number(backgroundImage.offsetY) || 0;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, offsetX, offsetY, width, height);
  ctx.restore();
}

function drawShape(ctx, shape, cellSize, preview = false) {
  const start = toPixels(shape.start, cellSize);
  const end = toPixels(shape.end, cellSize);
  const color = shape.color || '#2563eb';
  const fill = colorToRgba(color, preview ? 0.2 : 0.28);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = fill;
  ctx.lineWidth = preview ? 2 : 3;
  ctx.setLineDash(preview && shape.measurement ? [8, 5] : []);

  if (shape.type === 'line' || shape.type === 'measure') {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    drawEndpoint(ctx, start, color);
    drawEndpoint(ctx, end, color);
  }

  if (shape.type === 'square') {
    const rect = rectFromPoints(start, end);
    if (shape.filled) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  if (shape.type === 'circle') {
    const radius = Math.hypot(end.x - start.x, end.y - start.y);
    ctx.beginPath();
    ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
    if (shape.filled) ctx.fill();
    ctx.stroke();
  }

  drawMeasurementLabel(ctx, shape, cellSize, color);
  ctx.restore();
}

function drawEndpoint(ctx, point, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMeasurementLabel(ctx, shape, cellSize, color) {
  const label = measurementLabel(shape);
  const position = labelPosition(shape, cellSize);

  ctx.save();
  ctx.font = '12px system-ui';
  const paddingX = 7;
  const paddingY = 4;
  const metrics = ctx.measureText(label);
  const width = metrics.width + paddingX * 2;
  const height = 22;
  const x = position.x + 10;
  const y = position.y - height - 8;

  ctx.fillStyle = 'rgba(15,23,42,0.86)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x + paddingX, y + height - paddingY - 4);
  ctx.restore();
}

function measurementLabel(shape) {
  const dx = shape.end.x - shape.start.x;
  const dy = shape.end.y - shape.start.y;

  if (shape.type === 'square') {
    return `${formatFeet(Math.abs(dx) * 5)} x ${formatFeet(Math.abs(dy) * 5)}`;
  }

  if (shape.type === 'circle') {
    return `r ${formatFeet(Math.hypot(dx, dy) * 5)}`;
  }

  return formatFeet(Math.hypot(dx, dy) * 5);
}

function formatFeet(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ft`;
}

function labelPosition(shape, cellSize) {
  const start = toPixels(shape.start, cellSize);
  const end = toPixels(shape.end, cellSize);

  if (shape.type === 'circle') {
    return end;
  }

  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
}

function rectFromPoints(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function toPixels(point, cellSize) {
  return {
    x: point.x * cellSize,
    y: point.y * cellSize
  };
}

function colorToRgba(color, alpha) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!match) return `rgba(37,99,235,${alpha})`;

  const red = parseInt(match[1], 16);
  const green = parseInt(match[2], 16);
  const blue = parseInt(match[3], 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function drawMissingTile(ctx, tileCode, x, y, cellSize) {
  ctx.fillStyle = '#3d4451';
  ctx.fillRect(x, y, cellSize, cellSize);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '10px system-ui';
  ctx.fillText(tileCode, x + 4, y + Math.min(22, cellSize - 8));
}

function drawActiveCell(ctx, cell, cellSize, color) {
  if (!cell) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect((cell.x - 1) * cellSize + 1.5, (cell.y - 1) * cellSize + 1.5, cellSize - 3, cellSize - 3);
  ctx.restore();
}

function loadImage(url, cache) {
  if (cache.has(url)) return cache.get(url);

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

  cache.set(url, promise);
  return promise;
}
