import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMap, getMap, listMaps, listTileAssets, patchTile, saveMap } from './api.js';
import { EntityPanel } from './components/EntityPanel.jsx';
import { MapCanvas } from './components/MapCanvas.jsx';
import { TilePalette } from './components/TilePalette.jsx';
import { EDITOR_LAYERS, formatCell, getTopTileAt, tileMatchesEditorLayer } from './editorLayers.js';
import './styles.css';

const TOOLS = [
  { id: 'paint', label: 'Paint', icon: PaintIcon },
  { id: 'erase', label: 'Erase', icon: EraseIcon },
  { id: 'move', label: 'Move', icon: MoveIcon },
  { id: 'line', label: 'Line', icon: LineIcon },
  { id: 'square', label: 'Square', icon: SquareIcon },
  { id: 'circle', label: 'Circle', icon: CircleIcon },
  { id: 'measure', label: 'Measure Line', icon: MeasureIcon },
  { id: 'measure-square', label: 'Measure Square', icon: SquareIcon },
  { id: 'measure-circle', label: 'Measure Circle', icon: CircleIcon },
  { id: 'entity', label: 'Entity', icon: EntityIcon }
];

const defaultBackgroundImage = {
  src: '',
  width: 1000,
  height: 1000,
  offsetX: 0,
  offsetY: 0
};

function App() {
  const [maps, setMaps] = useState([]);
  const [activeMap, setActiveMap] = useState(null);
  const [tiles, setTiles] = useState([]);
  const [selectedTile, setSelectedTile] = useState(null);
  const [tool, setTool] = useState('paint');
  const [editorLayer, setEditorLayer] = useState('terrain');
  const [drawingColor, setDrawingColor] = useState('#2563eb');
  const [filledDrawing, setFilledDrawing] = useState(true);
  const [cellSize, setCellSize] = useState(50);
  const [drawings, setDrawings] = useState([]);
  const [backgroundImage, setBackgroundImage] = useState(defaultBackgroundImage);
  const [entities, setEntities] = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [rightTab, setRightTab] = useState('tiles');
  const [panels, setPanels] = useState({ left: true, top: true, right: true });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newMap, setNewMap] = useState({ groupName: 'demo', mapName: 'map1', gridWidth: 40, gridHeight: 40 });
  const activeMapRef = useRef(null);
  const editorStateRef = useRef({
    cellSize: 50,
    backgroundImage: defaultBackgroundImage,
    drawings: [],
    entities: []
  });
  const editQueueRef = useRef(Promise.resolve());

  const selectedKey = useMemo(() => {
    if (!activeMap) return '';
    return `${activeMap.groupName}/${activeMap.mapName}`;
  }, [activeMap]);

  const layerTiles = useMemo(() => {
    return tiles.filter((tile) => tileMatchesEditorLayer(tile, editorLayer));
  }, [editorLayer, tiles]);

  const selectedEntity = useMemo(() => {
    return entities.find((entity) => entity.id === selectedEntityId) ?? null;
  }, [entities, selectedEntityId]);

  useEffect(() => {
    refreshMaps();
    listTileAssets()
      .then((data) => {
        setTiles(data.tiles);
        setSelectedTile(data.tiles.find((tile) => tileMatchesEditorLayer(tile, editorLayer)) ?? data.tiles[0] ?? null);
      })
      .catch(showError);
  }, []);

  useEffect(() => {
    activeMapRef.current = activeMap;
  }, [activeMap]);

  useEffect(() => {
    if (!selectedKey) {
      setDrawings([]);
      setBackgroundImage(defaultBackgroundImage);
      setEntities([]);
      setSelectedEntityId('');
      setCellSize(50);
      return;
    }

    const legacyDrawings = readLegacyStoredJson(`pbphud-map-drawings:${selectedKey}`, []);
    const legacyBackground = readLegacyStoredJson(`pbphud-map-background:${selectedKey}`, defaultBackgroundImage);
    const legacyEntities = readLegacyStoredJson(`pbphud-map-entities:${selectedKey}`, []);
    const nextDrawings = activeMap?.drawings?.length ? activeMap.drawings : legacyDrawings;
    const nextBackground = activeMap?.backgroundImage?.src ? activeMap.backgroundImage : legacyBackground;
    const nextEntities = activeMap?.entities?.length ? activeMap.entities : legacyEntities;
    setCellSize(activeMap?.cellSize || 50);
    setDrawings(nextDrawings);
    setBackgroundImage(nextBackground);
    setEntities(nextEntities);
    setSelectedEntityId(nextEntities[0]?.id ?? '');
  }, [selectedKey]);

  useEffect(() => {
    editorStateRef.current = { cellSize, backgroundImage, drawings, entities };
  }, [backgroundImage, cellSize, drawings, entities]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const map = activeMapRef.current;
      if (!map) return;
      saveCurrentMap(map, true);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (tool === 'move' && editorLayer === 'terrain') {
      setTool('paint');
    }
  }, [editorLayer, tool]);

  useEffect(() => {
    if (!tiles.length) return;
    if (selectedTile && tileMatchesEditorLayer(selectedTile, editorLayer)) return;
    setSelectedTile(tiles.find((tile) => tileMatchesEditorLayer(tile, editorLayer)) ?? null);
  }, [editorLayer, selectedTile, tiles]);

  async function refreshMaps() {
    try {
      const data = await listMaps();
      setMaps(data.maps);
      if (!activeMap && data.maps[0]) {
        await loadMap(data.maps[0].groupName, data.maps[0].mapName);
      }
    } catch (err) {
      showError(err);
    }
  }

  async function loadMap(groupName, mapName) {
    try {
      const data = await getMap(groupName, mapName);
      setActiveMap(data.map);
      setMessage(`Loaded ${groupName}/${mapName}`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateMap(event) {
    event.preventDefault();
    try {
      const data = await createMap({
        ...newMap,
        gridWidth: Number(newMap.gridWidth),
        gridHeight: Number(newMap.gridHeight)
      });
      setActiveMap(data.map);
      setMessage(`Created ${data.map.groupName}/${data.map.mapName}`);
      setError('');
      await refreshMaps();
    } catch (err) {
      showError(err);
    }
  }

  function handlePlaceTile(payload) {
    enqueueTilePatch(
      () => ({
        x: payload.x,
        y: payload.y,
        tileCode: payload.tileCode,
        layer: payload.layer
      }),
      () => `Painted ${payload.tileCode} at ${formatCell(payload.x, payload.y)}`
    );
  }

  function handleEraseTile({ x, y, editorLayer: targetLayer }) {
    enqueueTilePatch(
      (currentMap) => {
        const topTile = getTopTileAt(currentMap.tiles, x, y, targetLayer);
        if (!topTile) return null;

        return {
          x,
          y,
          tileCode: topTile.tileCode,
          layer: topTile.layer,
          erase: true
        };
      },
      (payload) => `Erased ${payload.tileCode} at ${formatCell(x, y)}`
    );
  }

  function handleMoveTile({ tile, toX, toY }) {
    if (!tile || (tile.x === toX && tile.y === toY)) return;

    enqueueTilePatch(
      () => ({
        x: tile.x,
        y: tile.y,
        tileCode: tile.tileCode,
        layer: tile.layer,
        erase: true
      }),
      () => `Picked up ${tile.tileCode} from ${formatCell(tile.x, tile.y)}`
    );

    enqueueTilePatch(
      () => ({
        x: toX,
        y: toY,
        tileCode: tile.tileCode,
        layer: tile.layer
      }),
      () => `Moved ${tile.tileCode} to ${formatCell(toX, toY)}`
    );
  }

  function handleAddDrawing(shape) {
    setDrawings((current) => [...current, shape]);
    setMessage(`Drew ${shape.type}`);
    setError('');
  }

  function handleMeasure(label) {
    setMessage(`Measured ${label}`);
    setError('');
  }

  function handleClearDrawings() {
    if (!drawings.length) return;
    setDrawings([]);
    setMessage('Cleared drawing overlays');
    setError('');
  }

  function handleBackgroundFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src) return;

      const image = new Image();
      image.onload = () => {
        setBackgroundImage({
          src,
          width: image.naturalWidth,
          height: image.naturalHeight,
          offsetX: 0,
          offsetY: 0
        });
        setMessage(`Added background ${file.name}`);
        setError('');
      };
      image.onerror = () => {
        setBackgroundImage({ ...defaultBackgroundImage, src });
        setMessage(`Added background ${file.name}`);
        setError('');
      };
      image.src = src;
    };
    reader.onerror = () => showError(new Error('Could not read background image'));
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function updateBackgroundImage(patch) {
    setBackgroundImage((current) => ({ ...current, ...patch }));
  }

  function clearBackgroundImage() {
    setBackgroundImage(defaultBackgroundImage);
    setMessage('Cleared background image');
    setError('');
  }

  function updateActiveMapSize(patch) {
    setActiveMap((current) => {
      if (!current) return current;
      const next = {
        ...current,
        ...patch
      };
      next.gridSize = Math.max(next.gridWidth ?? next.gridSize, next.gridHeight ?? next.gridSize);
      activeMapRef.current = next;
      return next;
    });
  }

  function handleAddEntity(entity) {
    const nextEntity = {
      ...entity,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      x: null,
      y: null
    };
    setEntities((current) => [...current, nextEntity]);
    setSelectedEntityId(nextEntity.id);
    setTool('entity');
    setMessage(`Added ${entity.name}. Select Entity tool and click the map to place it.`);
    setError('');
  }

  function handleUpdateEntity(id, patch) {
    setEntities((current) => current.map((entity) => {
      if (entity.id !== id) return entity;
      const next = { ...entity, ...patch };
      if (next.maxHp < 1) next.maxHp = 1;
      if (next.hp > next.maxHp) next.hp = next.maxHp;
      return next;
    }));
  }

  function handleDeleteEntity(id) {
    setEntities((current) => current.filter((entity) => entity.id !== id));
    if (selectedEntityId === id) {
      const nextEntity = entities.find((entity) => entity.id !== id);
      setSelectedEntityId(nextEntity?.id ?? '');
    }
  }

  function handlePlaceEntity({ entityId, x, y }) {
    handleUpdateEntity(entityId, { x, y });
    const entity = entities.find((item) => item.id === entityId);
    if (entity) {
      setMessage(`Placed ${entity.name} at ${formatCell(x, y)}`);
      setError('');
    }
  }

  function togglePanel(panel) {
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }

  async function handleSave() {
    if (!activeMap) return;
    await saveCurrentMap(activeMap, false);
  }

  async function saveCurrentMap(map, quiet = false) {
    const editorState = editorStateRef.current;
    try {
      const data = await saveMap(map.groupName, map.mapName, {
        gridSize: map.gridSize,
        gridWidth: map.gridWidth ?? map.gridSize,
        gridHeight: map.gridHeight ?? map.gridSize,
        tiles: map.tiles,
        notes: map.notes,
        cellSize: editorState.cellSize,
        backgroundImage: editorState.backgroundImage,
        drawings: editorState.drawings,
        entities: editorState.entities
      });
      activeMapRef.current = data.map;
      setActiveMap(data.map);
      setMessage(quiet ? `Auto-saved ${new Date().toLocaleTimeString()}` : 'Map saved');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  function showError(err) {
    setError(err.message || 'Something went wrong');
  }

  function enqueueTilePatch(buildPayload, buildMessage) {
    const targetMap = activeMapRef.current;
    if (!targetMap) return;

    editQueueRef.current = editQueueRef.current
      .catch(() => {})
      .then(async () => {
        const currentMap = activeMapRef.current;
        const currentKey = currentMap ? `${currentMap.groupName}/${currentMap.mapName}` : '';
        const targetKey = `${targetMap.groupName}/${targetMap.mapName}`;
        if (!currentMap || currentKey !== targetKey) return;

        const payload = buildPayload(currentMap);
        if (!payload) return;

        const data = await patchTile(targetMap.groupName, targetMap.mapName, payload);
        activeMapRef.current = data.map;
        setActiveMap(data.map);
        setMessage(buildMessage?.(payload, data.map) || 'Map updated');
        setError('');
      })
      .catch(showError);
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>PBPHud Map Editor</h1>
          <p>Node.js + MariaDB + React prototype</p>
        </div>
        <div className="topbar-actions">
          <div className="panel-switches" aria-label="Panel visibility">
            <button
              type="button"
              className={panels.left ? 'selected' : ''}
              onClick={() => togglePanel('left')}
              aria-pressed={panels.left}
            >
              Maps
            </button>
            <button
              type="button"
              className={panels.top ? 'selected' : ''}
              onClick={() => togglePanel('top')}
              aria-pressed={panels.top}
            >
              Tools
            </button>
            <button
              type="button"
              className={panels.right ? 'selected' : ''}
              onClick={() => togglePanel('right')}
              aria-pressed={panels.right}
            >
              Tiles/Entities
            </button>
          </div>
          <button onClick={handleSave} disabled={!activeMap}>Save</button>
        </div>
      </header>

      <section
        className={[
          'workspace',
          panels.left ? '' : 'left-panel-collapsed',
          panels.right ? '' : 'right-panel-collapsed'
        ].filter(Boolean).join(' ')}
      >
        <nav className="sidebar">
          <form className="create-form" onSubmit={handleCreateMap}>
            <strong>New Map</strong>
            <input
              value={newMap.groupName}
              onChange={(event) => setNewMap({ ...newMap, groupName: event.target.value })}
              placeholder="Group"
            />
            <input
              value={newMap.mapName}
              onChange={(event) => setNewMap({ ...newMap, mapName: event.target.value })}
              placeholder="Map name"
            />
            <input
              type="number"
              min="5"
              max="99"
              value={newMap.gridWidth}
              onChange={(event) => setNewMap({ ...newMap, gridWidth: event.target.value })}
              placeholder="Width squares"
            />
            <input
              type="number"
              min="5"
              max="99"
              value={newMap.gridHeight}
              onChange={(event) => setNewMap({ ...newMap, gridHeight: event.target.value })}
              placeholder="Height squares"
            />
            <button type="submit">Create</button>
          </form>

          <div className="map-list">
            <strong>Maps</strong>
            {maps.map((map) => {
              const key = `${map.groupName}/${map.mapName}`;
              return (
                <button
                  key={key}
                  className={key === selectedKey ? 'selected' : ''}
                  onClick={() => loadMap(map.groupName, map.mapName)}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </nav>

        <section className={`map-panel ${panels.top ? '' : 'top-panel-collapsed'}`}>
          <div className={`editor-toolbar ${panels.top ? '' : 'collapsed'}`} aria-label="Map editing tools">
            <div className="tool-group" role="group" aria-label="Tool">
              {TOOLS.map((item) => {
                const Icon = item.icon;
                const disabled = item.id === 'move' && editorLayer === 'terrain';
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={tool === item.id ? 'selected' : ''}
                    disabled={disabled}
                    onClick={() => setTool(item.id)}
                    title={disabled ? 'Move is available for objects and players/NPCs' : item.label}
                    aria-pressed={tool === item.id}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="draw-options" aria-label="Drawing options">
              <label className="size-control map-size-control">
                <span>Map W</span>
                <input
                  type="number"
                  min="5"
                  max="99"
                  value={activeMap?.gridWidth ?? activeMap?.gridSize ?? 40}
                  disabled={!activeMap}
                  onChange={(event) => updateActiveMapSize({ gridWidth: clampNumber(event.target.value, 5, 99, 40) })}
                />
              </label>
              <label className="size-control map-size-control">
                <span>Map H</span>
                <input
                  type="number"
                  min="5"
                  max="99"
                  value={activeMap?.gridHeight ?? activeMap?.gridSize ?? 40}
                  disabled={!activeMap}
                  onChange={(event) => updateActiveMapSize({ gridHeight: clampNumber(event.target.value, 5, 99, 40) })}
                />
              </label>
              <label className="color-control">
                <span>Color</span>
                <input
                  type="color"
                  value={drawingColor}
                  onChange={(event) => setDrawingColor(event.target.value)}
                  aria-label="Drawing color"
                />
              </label>
              <label className="checkbox-control">
                <input
                  type="checkbox"
                  checked={filledDrawing}
                  onChange={(event) => setFilledDrawing(event.target.checked)}
                />
                <span>Fill</span>
              </label>
              <label className="size-control">
                <span>Grid square px</span>
                <input
                  type="number"
                  min="20"
                  max="120"
                  value={cellSize}
                  onChange={(event) => setCellSize(clampNumber(event.target.value, 20, 120, 50))}
                />
              </label>
              <button type="button" onClick={handleClearDrawings} disabled={!drawings.length}>
                Clear drawings
              </button>
            </div>

            <div className="background-options" aria-label="Background image options">
              <label className="file-control">
                <span>Background</span>
                <input type="file" accept="image/*" onChange={handleBackgroundFile} />
              </label>
              <label className="text-control background-url-control">
                <span>Image URL</span>
                <input
                  value={backgroundImage.src}
                  onChange={(event) => updateBackgroundImage({ src: event.target.value })}
                  placeholder="https://... or /path/image.png"
                />
              </label>
              <label className="size-control">
                <span>W px</span>
                <input
                  type="number"
                  min="1"
                  value={backgroundImage.width}
                  onChange={(event) => updateBackgroundImage({ width: clampNumber(event.target.value, 1, 20000, 1) })}
                />
              </label>
              <label className="size-control">
                <span>H px</span>
                <input
                  type="number"
                  min="1"
                  value={backgroundImage.height}
                  onChange={(event) => updateBackgroundImage({ height: clampNumber(event.target.value, 1, 20000, 1) })}
                />
              </label>
              <label className="size-control">
                <span>X px</span>
                <input
                  type="number"
                  value={backgroundImage.offsetX}
                  onChange={(event) => updateBackgroundImage({ offsetX: readNumberInput(event.target.value, 0) })}
                />
              </label>
              <label className="size-control">
                <span>Y px</span>
                <input
                  type="number"
                  value={backgroundImage.offsetY}
                  onChange={(event) => updateBackgroundImage({ offsetY: readNumberInput(event.target.value, 0) })}
                />
              </label>
              <button type="button" onClick={clearBackgroundImage} disabled={!backgroundImage.src}>
                Clear background
              </button>
            </div>

            <div className="tool-group layer-group" role="group" aria-label="Paint layer">
              {EDITOR_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={editorLayer === layer.id ? 'selected' : ''}
                  onClick={() => setEditorLayer(layer.id)}
                  aria-pressed={editorLayer === layer.id}
                >
                  {layer.label}
                </button>
              ))}
            </div>
          </div>

          <MapCanvas
            map={activeMap}
            selectedTile={selectedTile}
            tool={tool}
            editorLayer={editorLayer}
            drawingOptions={{ color: drawingColor, filled: filledDrawing }}
            drawings={drawings}
            backgroundImage={backgroundImage}
            entities={entities}
            selectedEntity={selectedEntity}
            cellSize={cellSize}
            onPlaceTile={handlePlaceTile}
            onEraseTile={handleEraseTile}
            onMoveTile={handleMoveTile}
            onAddDrawing={handleAddDrawing}
            onMeasure={handleMeasure}
            onPlaceEntity={handlePlaceEntity}
            onMoveEntity={handlePlaceEntity}
          />
        </section>

        <aside className="right-panel">
          <div className="right-tabs" role="tablist" aria-label="Right panel">
            <button
              type="button"
              className={rightTab === 'tiles' ? 'selected' : ''}
              onClick={() => setRightTab('tiles')}
              role="tab"
              aria-selected={rightTab === 'tiles'}
            >
              Tiles
            </button>
            <button
              type="button"
              className={rightTab === 'entities' ? 'selected' : ''}
              onClick={() => setRightTab('entities')}
              role="tab"
              aria-selected={rightTab === 'entities'}
            >
              Entities
            </button>
          </div>

          <div className="right-tab-body">
            {rightTab === 'tiles' ? (
              <TilePalette
                tiles={layerTiles}
                selectedTile={selectedTile}
                onSelect={setSelectedTile}
                layerLabel={EDITOR_LAYERS.find((layer) => layer.id === editorLayer)?.label}
              />
            ) : (
              <EntityPanel
                entities={entities}
                selectedEntityId={selectedEntityId}
                tiles={tiles}
                onAdd={handleAddEntity}
                onUpdate={handleUpdateEntity}
                onDelete={handleDeleteEntity}
                onSelect={(id) => {
                  setSelectedEntityId(id);
                  setTool('entity');
                }}
              />
            )}
          </div>
        </aside>
      </section>

      {(message || error) && (
        <footer className={`status ${error ? 'error' : ''}`}>
          {error || message}
        </footer>
      )}
    </main>
  );
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function readLegacyStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function readNumberInput(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function PaintIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M13.8 2.8 17.2 6l-8.7 8.7-4.2 1 1-4.2 8.5-8.7Z" />
      <path d="M12.2 4.4 15.6 8" />
    </svg>
  );
}

function EraseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 12 6.8-6.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 16H5.8L4 14.2a1.6 1.6 0 0 1 0-2.2Z" />
      <path d="M8.2 8.8 12 12.6" />
      <path d="M8.8 16H17" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2v16" />
      <path d="m6.8 5.2 3.2-3.2 3.2 3.2" />
      <path d="m6.8 14.8 3.2 3.2 3.2-3.2" />
      <path d="M2 10h16" />
      <path d="m5.2 6.8-3.2 3.2 3.2 3.2" />
      <path d="m14.8 6.8 3.2 3.2-3.2 3.2" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 16 16 4" />
      <path d="M4 16h3" />
      <path d="M4 16v-3" />
      <path d="M16 4h-3" />
      <path d="M16 4v3" />
    </svg>
  );
}

function SquareIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6" />
    </svg>
  );
}

function MeasureIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 14.5 14.5 3.5l2 2-11 11-2-2Z" />
      <path d="m7 13-1-1" />
      <path d="m9 11-1-1" />
      <path d="m11 9-1-1" />
      <path d="m13 7-1-1" />
    </svg>
  );
}

function EntityIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="6" r="3" />
      <path d="M4.5 17a5.5 5.5 0 0 1 11 0" />
    </svg>
  );
}

createRoot(document.getElementById('root')).render(<App />);
