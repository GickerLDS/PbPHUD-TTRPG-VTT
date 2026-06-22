import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createEntity,
  createCampaign,
  createCampaignMap,
  createMap,
  getAuthConfig,
  getCurrentUser,
  getMap,
  getMapById,
  getViewerUserId,
  inviteCampaignMember,
  inviteMapUser,
  listCampaigns,
  listMaps,
  listTileAssets,
  loginAccount,
  logoutAccount,
  patchEntity,
  patchTile,
  registerAccount,
  resendVerificationEmail,
  saveMap,
  setMapVisibility,
  setViewerUserId,
  shareMap,
  unshareMap,
  verifyEmail
} from './api.js';
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
  const path = window.location.pathname;
  const mapRouteMatch = path.match(/^\/maps\/(\d+)$/);
  const [maps, setMaps] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
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
  const [authUser, setAuthUser] = useState(null);
  const [authConfig, setAuthConfig] = useState({
    recaptchaSiteKey: '',
    recaptchaType: 'v3',
    recaptchaAction: 'register',
    recaptchaMinScore: 0.5,
    requireRecaptcha: false
  });
  const [authMode, setAuthMode] = useState('login');
  const [authDraft, setAuthDraft] = useState({ email: '', displayName: '', password: '' });
  const recaptchaRef = useRef(null);
  const recaptchaWidgetRef = useRef(null);
  const [viewerUserId, setViewerUserIdState] = useState(() => getViewerUserId());
  const [viewerUserIdDraft, setViewerUserIdDraft] = useState(() => getViewerUserId());
  const [newMap, setNewMap] = useState({ groupName: 'demo', mapName: 'map1', gridWidth: 40, gridHeight: 40 });
  const [mapSizeDraft, setMapSizeDraft] = useState({ gridWidth: '40', gridHeight: '40' });
  const [shareUserId, setShareUserId] = useState('');
  const [campaignDraft, setCampaignDraft] = useState({ name: '' });
  const [campaignMemberDraft, setCampaignMemberDraft] = useState({});
  const [campaignMapDraft, setCampaignMapDraft] = useState({});
  const [mapInviteDraft, setMapInviteDraft] = useState('');
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

  const permissions = activeMap?.permissions ?? {
    canViewMap: true,
    canCreateMaps: Boolean(viewerUserId),
    canEditMaps: false,
    canEditTiles: false,
    canEditDrawings: false,
    canEditBackground: false,
    canManageEntities: false,
    canCreateEntities: Boolean(viewerUserId),
    canUseMeasurements: true,
    canControlEntities: Boolean(viewerUserId),
    canShareMap: false
  };

  const visibleTools = useMemo(() => {
    return TOOLS.filter((item) => {
      if (['paint', 'erase', 'move', 'line', 'square', 'circle'].includes(item.id)) {
        return permissions.canEditMaps;
      }
      if (['measure', 'measure-square', 'measure-circle'].includes(item.id)) {
        return permissions.canUseMeasurements;
      }
      if (item.id === 'entity') {
        return permissions.canCreateEntities || permissions.canControlEntities;
      }
      return true;
    });
  }, [permissions]);

  useEffect(() => {
    refreshMaps();
    loadAuth();
    listTileAssets()
      .then((data) => {
        setTiles(data.tiles);
        setSelectedTile(data.tiles.find((tile) => tileMatchesEditorLayer(tile, editorLayer)) ?? data.tiles[0] ?? null);
      })
      .catch(showError);
  }, []);

  useEffect(() => {
    if (!authUser) return;
    refreshCampaigns();
    if (mapRouteMatch?.[1]) {
      loadMapById(mapRouteMatch[1]);
    }
  }, [authUser?.id, path]);

  useEffect(() => {
    if (authMode !== 'register' || !authConfig.recaptchaSiteKey || authConfig.recaptchaType !== 'v2') return;

    let cancelled = false;
    loadRecaptchaScript(authConfig.recaptchaSiteKey, 'v2')
      .then(() => {
        if (cancelled || !recaptchaRef.current || !window.grecaptcha?.render || recaptchaWidgetRef.current !== null) return;
        recaptchaWidgetRef.current = window.grecaptcha.render(recaptchaRef.current, {
          sitekey: authConfig.recaptchaSiteKey
        });
      })
      .catch(showError);

    return () => {
      cancelled = true;
      recaptchaWidgetRef.current = null;
    };
  }, [authConfig.recaptchaSiteKey, authConfig.recaptchaType, authMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('verifyEmailToken');
    if (!token) return;

    verifyEmail(token)
      .then((data) => {
        setAuthUser(data.user);
        setViewerUserIdState(data.user.id);
        setViewerUserId(data.user.id);
        setViewerUserIdDraft(data.user.id);
        setMessage('Email verified. You are signed in.');
        window.history.replaceState({}, '', window.location.pathname);
        return refreshMaps();
      })
      .catch(showError);
  }, []);

  useEffect(() => {
    if (visibleTools.some((item) => item.id === tool)) return;
    setTool(visibleTools[0]?.id ?? 'entity');
  }, [tool, visibleTools]);

  useEffect(() => {
    activeMapRef.current = activeMap;
  }, [activeMap]);

  useEffect(() => {
    if (!activeMap) {
      setMapSizeDraft({ gridWidth: '40', gridHeight: '40' });
      return;
    }

    setMapSizeDraft({
      gridWidth: String(activeMap.gridWidth ?? activeMap.gridSize ?? 40),
      gridHeight: String(activeMap.gridHeight ?? activeMap.gridSize ?? 40)
    });
  }, [activeMap?.groupName, activeMap?.mapName]);

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

  async function loadAuth() {
    try {
      const [configData, userData] = await Promise.all([
        getAuthConfig(),
        getCurrentUser()
      ]);
      setAuthConfig(configData);
      if (userData.user) {
        setAuthUser(userData.user);
        setViewerUserIdState(userData.user.id);
        setViewerUserId(userData.user.id);
        setViewerUserIdDraft(userData.user.id);
        await refreshCampaigns();
      }
    } catch (err) {
      showError(err);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    try {
      if (authMode === 'register') {
        const latestAuthConfig = await getAuthConfig();
        setAuthConfig(latestAuthConfig);
        const recaptchaToken = await getRecaptchaToken(latestAuthConfig, recaptchaWidgetRef.current);
        if (latestAuthConfig.requireRecaptcha && !recaptchaToken) {
          throw new Error('Could not create a reCAPTCHA token. Refresh the page and try again.');
        }
        const data = await registerAccount({ ...authDraft, recaptchaToken });
        window.grecaptcha?.reset?.(recaptchaWidgetRef.current);
        setMessage(data.message || 'Registration created. Check your email to verify your account.');
        setError('');
        setAuthMode('login');
        return;
      }

      const data = await loginAccount({ email: authDraft.email, password: authDraft.password });
      setAuthUser(data.user);
      setViewerUserIdState(data.user.id);
      setViewerUserId(data.user.id);
      setViewerUserIdDraft(data.user.id);
      setMessage(`Signed in as ${data.user.displayName}`);
      setError('');
      await refreshMaps();
    } catch (err) {
      showError(err);
    }
  }

  async function handleResendVerification() {
    try {
      if (!authDraft.email.trim()) {
        throw new Error('Enter your email address first.');
      }

      const data = await resendVerificationEmail(authDraft.email);
      setMessage(data.message);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleLogout() {
    try {
      await logoutAccount();
      setAuthUser(null);
      setViewerUserIdState('');
      setViewerUserId('');
      setViewerUserIdDraft('');
      setCampaigns([]);
      if (path !== '/') window.location.href = '/';
      setMessage('Signed out');
      setError('');
      await refreshMaps();
    } catch (err) {
      showError(err);
    }
  }

  async function refreshCampaigns() {
    try {
      const data = await listCampaigns();
      setCampaigns(data.campaigns);
    } catch (err) {
      if (authUser) showError(err);
    }
  }

  async function loadMapById(mapId) {
    try {
      const data = await getMapById(mapId);
      setActiveMap(data.map);
      setMessage(`Loaded ${data.map.mapName}`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateCampaign(event) {
    event.preventDefault();
    try {
      const data = await createCampaign(campaignDraft);
      setCampaignDraft({ name: '' });
      setCampaigns((current) => [data.campaign, ...current]);
      setMessage(`Created campaign ${data.campaign.name}`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleInviteCampaignMember(campaignId) {
    const userId = String(campaignMemberDraft[campaignId] || '').trim();
    if (!userId) return;
    try {
      await inviteCampaignMember(campaignId, userId);
      setCampaignMemberDraft((current) => ({ ...current, [campaignId]: '' }));
      setMessage(`Invited ${userId}`);
      setError('');
      await refreshCampaigns();
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateCampaignMap(campaignId) {
    const draft = campaignMapDraft[campaignId] || {};
    const mapName = String(draft.mapName || '').trim();
    if (!mapName) return;
    try {
      const data = await createCampaignMap(campaignId, {
        mapName,
        gridWidth: parseGridDimension(draft.gridWidth || 40, 40),
        gridHeight: parseGridDimension(draft.gridHeight || 40, 40)
      });
      setCampaignMapDraft((current) => ({ ...current, [campaignId]: {} }));
      setMessage(`Created map ${data.map.name}`);
      setError('');
      await refreshCampaigns();
    } catch (err) {
      showError(err);
    }
  }

  async function handleToggleMapVisibility() {
    if (!activeMap?.id) return;
    try {
      const data = await setMapVisibility(activeMap.id, !activeMap.playerVisible);
      activeMapRef.current = data.map;
      setActiveMap(data.map);
      setMessage(data.map.playerVisible ? 'Map is visible to campaign players' : 'Map is hidden from campaign players');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleInviteMapUser(event) {
    event.preventDefault();
    const userId = mapInviteDraft.trim();
    if (!activeMap?.id || !userId) return;
    try {
      const data = await inviteMapUser(activeMap.id, userId);
      activeMapRef.current = data.map;
      setActiveMap(data.map);
      setMapInviteDraft('');
      setMessage(`Invited ${userId} to this map`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleConfirmViewer(event) {
    event.preventDefault();
    const nextViewerUserId = viewerUserIdDraft.trim();
    setViewerUserIdState(nextViewerUserId);
    setViewerUserId(nextViewerUserId);
    setMessage(nextViewerUserId ? `Confirmed viewer ${nextViewerUserId}` : 'Viewer cleared');
    setError('');
    await refreshMaps();
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
    if (!viewerUserId) {
      showError(new Error('Confirm a Viewer ID before creating maps.'));
      return;
    }
    if (!permissions.canCreateMaps) {
      showError(new Error('This viewer cannot create maps.'));
      return;
    }
    const gridWidth = parseGridDimension(newMap.gridWidth);
    const gridHeight = parseGridDimension(newMap.gridHeight);
    if (!gridWidth || !gridHeight) {
      showError(new Error('Map width and height must be numbers from 5 to 99.'));
      return;
    }
    try {
      const data = await createMap({
        ...newMap,
        gridWidth,
        gridHeight
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
    if (!permissions.canEditTiles) return;
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
    if (!permissions.canEditTiles) return;
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
    if (!permissions.canEditTiles) return;
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
    if (!permissions.canEditDrawings) return;
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
    if (!permissions.canEditBackground) {
      event.target.value = '';
      return;
    }
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
    if (!permissions.canEditBackground) return;
    setBackgroundImage((current) => ({ ...current, ...patch }));
  }

  function clearBackgroundImage() {
    if (!permissions.canEditBackground) return;
    setBackgroundImage(defaultBackgroundImage);
    setMessage('Cleared background image');
    setError('');
  }

  function updateActiveMapSize(patch) {
    if (!permissions.canEditMaps) return;
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

  function commitActiveMapSize(field) {
    if (!activeMap || !permissions.canEditMaps) return;
    const fallback = activeMap[field] ?? activeMap.gridSize ?? 40;
    const value = parseGridDimension(mapSizeDraft[field], fallback);
    setMapSizeDraft((current) => ({ ...current, [field]: String(value) }));
    updateActiveMapSize({ [field]: value });
  }

  async function handleAddEntity(entity) {
    if (!activeMap) return;
    if (!permissions.canCreateEntities) {
      showError(new Error('Only the map owner and shared users can add player entities.'));
      return;
    }
    try {
      const data = await createEntity(activeMap.groupName, activeMap.mapName, entity);
      activeMapRef.current = data.map;
      setActiveMap(data.map);
      setSelectedEntityId(data.entity.id);
      setTool('entity');
      setMessage(`Added ${data.entity.name}. Select Entity tool and click the map to place it.`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  function handleUpdateEntity(id, patch) {
    const entity = entities.find((item) => item.id === id);
    if (!entity || !canControlEntity(entity, entities, viewerUserId, permissions)) {
      showError(new Error('You can only control your own player entities.'));
      return;
    }

    setEntities((current) => current.map((entity) => {
      if (entity.id !== id) return entity;
      const next = { ...entity, ...patch };
      if (next.maxHp < 1) next.maxHp = 1;
      if (next.hp > next.maxHp) next.hp = next.maxHp;
      return next;
    }));

    if (activeMap && isEntityPatch(patch)) {
      patchEntity(activeMap.groupName, activeMap.mapName, id, patch)
        .then((data) => {
          activeMapRef.current = data.map;
          setActiveMap(data.map);
          setError('');
        })
        .catch(showError);
    }
  }

  function handleDeleteEntity(id) {
    if (!permissions.canManageEntities) {
      showError(new Error('Only the campaign owner can remove entities.'));
      return;
    }
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

  async function handleShareMap(event) {
    event.preventDefault();
    if (!activeMap || !permissions.canShareMap) return;
    const userId = shareUserId.trim();
    if (!userId) return;

    try {
      const data = await shareMap(activeMap.groupName, activeMap.mapName, userId);
      activeMapRef.current = data.map;
      setActiveMap(data.map);
      setShareUserId('');
      setMessage(`Shared map with ${userId}`);
      setError('');
      await refreshMaps();
    } catch (err) {
      showError(err);
    }
  }

  async function handleUnshareMap(userId) {
    if (!activeMap || !permissions.canShareMap) return;

    try {
      const data = await unshareMap(activeMap.groupName, activeMap.mapName, userId);
      activeMapRef.current = data.map;
      setActiveMap(data.map);
      setMessage(`Stopped sharing with ${userId}`);
      setError('');
      await refreshMaps();
    } catch (err) {
      showError(err);
    }
  }

  async function handleSave() {
    if (!activeMap) return;
    if (!permissions.canEditMaps) {
      showError(new Error('Only the campaign owner can save map edits.'));
      return;
    }
    await saveCurrentMap(activeMap, false);
  }

  async function saveCurrentMap(map, quiet = false) {
    if (!permissions.canEditMaps) return;
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
    if (!permissions.canEditTiles) return;
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

  if (!authUser) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>PBPHud VTT</h1>
          <p>Sign in to manage campaigns and maps.</p>
          <form className="auth-page-form" onSubmit={handleAuthSubmit}>
            <div className="auth-mode">
              <button type="button" className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>
                Sign in
              </button>
              <button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => setAuthMode('register')}>
                Register
              </button>
            </div>
            <input
              type="email"
              value={authDraft.email}
              onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })}
              placeholder="Email"
              autoComplete="email"
            />
            {authMode === 'register' && (
              <input
                value={authDraft.displayName}
                onChange={(event) => setAuthDraft({ ...authDraft, displayName: event.target.value })}
                placeholder="Display name"
                autoComplete="name"
              />
            )}
            <input
              type="password"
              value={authDraft.password}
              onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })}
              placeholder="Password"
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
            />
            <button type="submit">{authMode === 'register' ? 'Create account' : 'Sign in'}</button>
            {authMode === 'login' && (
              <button type="button" className="text-button" onClick={handleResendVerification}>
                Resend verification email
              </button>
            )}
          </form>
          {(message || error) && <p className={`auth-message ${error ? 'error' : ''}`}>{error || message}</p>}
        </section>
      </main>
    );
  }

  if (!mapRouteMatch) {
    return (
      <main className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <h1>Campaign Dashboard</h1>
            <p>Signed in as {authUser.displayName}</p>
          </div>
          <button type="button" onClick={handleLogout}>Sign out</button>
        </header>

        <section className="dashboard-layout">
          <form className="dashboard-create" onSubmit={handleCreateCampaign}>
            <strong>New Campaign</strong>
            <input
              value={campaignDraft.name}
              onChange={(event) => setCampaignDraft({ name: event.target.value })}
              placeholder="Campaign name"
            />
            <button type="submit">Create campaign</button>
          </form>

          <section className="campaign-list">
            <h2>Your Campaigns</h2>
            {campaigns.map((campaign) => (
              <article className="campaign-card" key={campaign.id}>
                <div className="campaign-card-header">
                  <div>
                    <h3>{campaign.name}</h3>
                    <p>{campaign.role === 'owner' ? 'Owner' : 'Invited player'} · {campaign.mapCount} maps</p>
                  </div>
                </div>

                {campaign.role === 'owner' && (
                  <div className="campaign-tools">
                    <div className="inline-form">
                      <input
                        value={campaignMemberDraft[campaign.id] || ''}
                        onChange={(event) => setCampaignMemberDraft((current) => ({ ...current, [campaign.id]: event.target.value }))}
                        placeholder="Invite user id"
                      />
                      <button type="button" onClick={() => handleInviteCampaignMember(campaign.id)}>Invite</button>
                    </div>
                    <div className="inline-form">
                      <input
                        value={campaignMapDraft[campaign.id]?.mapName || ''}
                        onChange={(event) => setCampaignMapDraft((current) => ({
                          ...current,
                          [campaign.id]: { ...(current[campaign.id] || {}), mapName: event.target.value }
                        }))}
                        placeholder="New map name"
                      />
                      <input
                        value={campaignMapDraft[campaign.id]?.gridWidth || 40}
                        onChange={(event) => setCampaignMapDraft((current) => ({
                          ...current,
                          [campaign.id]: { ...(current[campaign.id] || {}), gridWidth: event.target.value }
                        }))}
                        inputMode="numeric"
                        aria-label="Map width"
                      />
                      <input
                        value={campaignMapDraft[campaign.id]?.gridHeight || 40}
                        onChange={(event) => setCampaignMapDraft((current) => ({
                          ...current,
                          [campaign.id]: { ...(current[campaign.id] || {}), gridHeight: event.target.value }
                        }))}
                        inputMode="numeric"
                        aria-label="Map height"
                      />
                      <button type="button" onClick={() => handleCreateCampaignMap(campaign.id)}>Create map</button>
                    </div>
                    <small>Members: {campaign.members.length ? campaign.members.join(', ') : 'No invited players yet'}</small>
                  </div>
                )}

                <div className="dashboard-map-list">
                  {campaign.maps.map((map) => (
                    <a key={map.id} href={`/maps/${map.id}`}>
                      <span>{map.name}</span>
                      <small>{map.playerVisible ? 'Visible to players' : map.invited ? 'Specifically invited' : 'Hidden'}</small>
                    </a>
                  ))}
                  {!campaign.maps.length && <p>No maps available.</p>}
                </div>
              </article>
            ))}
            {!campaigns.length && <p className="empty-state">Create a campaign to get started.</p>}
          </section>
        </section>

        {(message || error) && <footer className={`status ${error ? 'error' : ''}`}>{error || message}</footer>}
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>PBPHud Map Editor</h1>
          <p>Node.js + MariaDB + React prototype</p>
        </div>
        <div className="topbar-actions">
          {authUser ? (
            <div className="account-panel">
              <span>Signed in as</span>
              <strong>{authUser.displayName}</strong>
              <small>{authUser.email}</small>
              <button type="button" onClick={handleLogout}>Sign out</button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <div className="auth-mode">
                <button
                  type="button"
                  className={authMode === 'login' ? 'selected' : ''}
                  onClick={() => setAuthMode('login')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={authMode === 'register' ? 'selected' : ''}
                  onClick={() => setAuthMode('register')}
                >
                  Register
                </button>
              </div>
              <input
                type="email"
                value={authDraft.email}
                onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })}
                placeholder="Email"
                autoComplete="email"
              />
              {authMode === 'register' && (
                <input
                  value={authDraft.displayName}
                  onChange={(event) => setAuthDraft({ ...authDraft, displayName: event.target.value })}
                  placeholder="Display name"
                  autoComplete="name"
                />
              )}
              <input
                type="password"
                value={authDraft.password}
                onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })}
                placeholder="Password"
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              />
              {authMode === 'register' && authConfig.recaptchaSiteKey && authConfig.recaptchaType === 'v2' && (
                <div className="recaptcha-control" ref={recaptchaRef} />
              )}
              <button type="submit">{authMode === 'register' ? 'Create account' : 'Sign in'}</button>
              {authMode === 'login' && (
                <button type="button" className="text-button" onClick={handleResendVerification}>
                  Resend verification email
                </button>
              )}
            </form>
          )}
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
          <button onClick={handleSave} disabled={!activeMap || !permissions.canEditMaps}>Save</button>
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
          {viewerUserId && (
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
              inputMode="numeric"
              pattern="[0-9]*"
              value={newMap.gridWidth}
              onChange={(event) => setNewMap({ ...newMap, gridWidth: event.target.value })}
              placeholder="Width squares"
            />
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={newMap.gridHeight}
              onChange={(event) => setNewMap({ ...newMap, gridHeight: event.target.value })}
              placeholder="Height squares"
            />
            <button type="submit">Create</button>
          </form>
          )}

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

          {activeMap && (
            <section className="share-panel">
              <strong>Map Access</strong>
              {activeMap.campaign && <small>Campaign: {activeMap.campaign.name}</small>}
              <small>Owner: {activeMap.ownerUserId || 'Legacy open map'}</small>
              {permissions.canEditMaps && activeMap.campaignId && (
                <>
                  <button type="button" onClick={handleToggleMapVisibility}>
                    {activeMap.playerVisible ? 'Hide from campaign players' : 'Show to campaign players'}
                  </button>
                  <form onSubmit={handleInviteMapUser}>
                    <input
                      value={mapInviteDraft}
                      onChange={(event) => setMapInviteDraft(event.target.value)}
                      placeholder="Campaign member user id"
                    />
                    <button type="submit">Invite to map</button>
                  </form>
                  <small>
                    Map-only invites: {(activeMap.invitedUserIds || []).length ? activeMap.invitedUserIds.join(', ') : 'None'}
                  </small>
                </>
              )}
              {permissions.canShareMap && (
                <form onSubmit={handleShareMap}>
                  <input
                    value={shareUserId}
                    onChange={(event) => setShareUserId(event.target.value)}
                    placeholder="User id to share"
                  />
                  <button type="submit">Share</button>
                </form>
              )}
              <div className="share-list">
                {(activeMap.sharedUserIds || []).map((userId) => (
                  <span key={userId}>
                    {userId}
                    {permissions.canShareMap && (
                      <button type="button" onClick={() => handleUnshareMap(userId)} aria-label={`Remove ${userId}`}>
                        Remove
                      </button>
                    )}
                  </span>
                ))}
                {!(activeMap.sharedUserIds || []).length && <small>No shared users</small>}
              </div>
            </section>
          )}
        </nav>

        <section className={`map-panel ${panels.top ? '' : 'top-panel-collapsed'}`}>
          <div className={`editor-toolbar ${panels.top ? '' : 'collapsed'}`} aria-label="Map editing tools">
            <div className="tool-group" role="group" aria-label="Tool">
              {visibleTools.map((item) => {
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
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={mapSizeDraft.gridWidth}
                  disabled={!activeMap || !permissions.canEditMaps}
                  onChange={(event) => setMapSizeDraft((current) => ({ ...current, gridWidth: event.target.value }))}
                  onBlur={() => commitActiveMapSize('gridWidth')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </label>
              <label className="size-control map-size-control">
                <span>Map H</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={mapSizeDraft.gridHeight}
                  disabled={!activeMap || !permissions.canEditMaps}
                  onChange={(event) => setMapSizeDraft((current) => ({ ...current, gridHeight: event.target.value }))}
                  onBlur={() => commitActiveMapSize('gridHeight')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </label>
              <label className="color-control">
                <span>Color</span>
                <input
                  type="color"
                  value={drawingColor}
                  disabled={!permissions.canEditDrawings}
                  onChange={(event) => setDrawingColor(event.target.value)}
                  aria-label="Drawing color"
                />
              </label>
              <label className="checkbox-control">
                <input
                  type="checkbox"
                  checked={filledDrawing}
                  disabled={!permissions.canEditDrawings}
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
                  disabled={!permissions.canEditMaps}
                  onChange={(event) => setCellSize(clampNumber(event.target.value, 20, 120, 50))}
                />
              </label>
              <button type="button" onClick={handleClearDrawings} disabled={!drawings.length || !permissions.canEditDrawings}>
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
                  disabled={!permissions.canEditBackground}
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
                  disabled={!permissions.canEditBackground}
                  onChange={(event) => updateBackgroundImage({ width: clampNumber(event.target.value, 1, 20000, 1) })}
                />
              </label>
              <label className="size-control">
                <span>H px</span>
                <input
                  type="number"
                  min="1"
                  value={backgroundImage.height}
                  disabled={!permissions.canEditBackground}
                  onChange={(event) => updateBackgroundImage({ height: clampNumber(event.target.value, 1, 20000, 1) })}
                />
              </label>
              <label className="size-control">
                <span>X px</span>
                <input
                  type="number"
                  value={backgroundImage.offsetX}
                  disabled={!permissions.canEditBackground}
                  onChange={(event) => updateBackgroundImage({ offsetX: readNumberInput(event.target.value, 0) })}
                />
              </label>
              <label className="size-control">
                <span>Y px</span>
                <input
                  type="number"
                  value={backgroundImage.offsetY}
                  disabled={!permissions.canEditBackground}
                  onChange={(event) => updateBackgroundImage({ offsetY: readNumberInput(event.target.value, 0) })}
                />
              </label>
              <button type="button" onClick={clearBackgroundImage} disabled={!backgroundImage.src || !permissions.canEditBackground}>
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
              permissions.canEditTiles ? (
                <TilePalette
                tiles={layerTiles}
                selectedTile={selectedTile}
                onSelect={setSelectedTile}
                layerLabel={EDITOR_LAYERS.find((layer) => layer.id === editorLayer)?.label}
              />
              ) : (
                <div className="empty-state compact">Map tiles are editable by the campaign owner.</div>
              )
            ) : (
              <EntityPanel
                entities={entities}
                selectedEntityId={selectedEntityId}
                tiles={tiles}
                canManageEntities={permissions.canManageEntities}
                canCreateEntities={permissions.canCreateEntities}
                canEditEntity={(entity) => canControlEntity(entity, entities, viewerUserId, permissions)}
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

function parseGridDimension(value, fallback = null) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return fallback;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(5, Math.min(99, Math.trunc(number)));
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

function canControlEntity(entity, entities, viewerUserId, permissions) {
  if (permissions.canManageEntities) return true;
  if (!permissions.canControlEntities || !viewerUserId) return false;
  if (entity.ownerId === viewerUserId) return true;
  if (entity.type !== 'charmie' || !entity.ownerId) return false;

  const ownerEntity = entities.find((candidate) => candidate.id === entity.ownerId);
  return ownerEntity?.ownerId === viewerUserId;
}

function isEntityPatch(patch) {
  return Object.keys(patch).every((key) => ['hp', 'maxHp', 'x', 'y'].includes(key));
}

async function getRecaptchaToken(config, widgetId) {
  if (!config.requireRecaptcha) return '';
  const siteKey = config.recaptchaSiteKey;
  if (!siteKey) throw new Error('reCAPTCHA is required but no site key is configured.');

  if (config.recaptchaType === 'v2') {
    return window.grecaptcha?.getResponse?.(widgetId) || '';
  }

  await loadRecaptchaScript(siteKey, 'v3');

  return new Promise((resolve, reject) => {
    window.grecaptcha.ready(() => {
      if (!window.grecaptcha?.execute) {
        reject(new Error('reCAPTCHA v3 did not load correctly. Refresh the page and try again.'));
        return;
      }
      window.grecaptcha.execute(siteKey, { action: config.recaptchaAction || 'register' }).then(resolve).catch(reject);
    });
  });
}

function loadRecaptchaScript(siteKey, type = 'v2') {
  const src = type === 'v3'
    ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
    : 'https://www.google.com/recaptcha/api.js?render=explicit';

  if (type === 'v3' && window.grecaptcha?.execute) return Promise.resolve();
  if (type === 'v2' && window.grecaptcha?.render) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pbphud-recaptcha="true"]');
    if (existing) {
      if (existing.src !== src) {
        existing.remove();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', reject, { once: true });
        if (window.grecaptcha) resolve();
        return;
      }
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.pbphudRecaptcha = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load reCAPTCHA from Google.'));
    document.head.appendChild(script);
  });
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
