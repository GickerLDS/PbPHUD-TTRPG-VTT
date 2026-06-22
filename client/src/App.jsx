import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  assignForumThreadMap,
  createEntity,
  createCampaign,
  createCampaignMap,
  createForumPost,
  createForumThread,
  createMap,
  getAuthConfig,
  getCurrentUser,
  getForumThread,
  getMap,
  getMapById,
  getViewerUserId,
  inviteCampaignMember,
  inviteMapUser,
  listCampaigns,
  listForumThreads,
  listMaps,
  listTileAssets,
  loginAccount,
  logoutAccount,
  patchEntity,
  patchTile,
  registerAccount,
  resendVerificationEmail,
  saveMap,
  sendContactMessage,
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
  const forumRouteMatch = path.match(/^\/campaigns\/(\d+)\/forums$/);
  const isAuthRoute = path === '/auth';
  const isContactRoute = path === '/contact';
  const isDashboardRoute = path === '/dashboard';
  const isSplashRoute = path === '/';
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
  const [contactDraft, setContactDraft] = useState({ name: '', email: '', subject: '', message: '' });
  const recaptchaRef = useRef(null);
  const recaptchaWidgetRef = useRef(null);
  const contactRecaptchaRef = useRef(null);
  const contactRecaptchaWidgetRef = useRef(null);
  const [viewerUserId, setViewerUserIdState] = useState(() => getViewerUserId());
  const [viewerUserIdDraft, setViewerUserIdDraft] = useState(() => getViewerUserId());
  const [newMap, setNewMap] = useState({ groupName: 'demo', mapName: 'map1', gridWidth: 40, gridHeight: 40 });
  const [mapSizeDraft, setMapSizeDraft] = useState({ gridWidth: '40', gridHeight: '40' });
  const [shareUserId, setShareUserId] = useState('');
  const [campaignDraft, setCampaignDraft] = useState({ name: '' });
  const [campaignMemberDraft, setCampaignMemberDraft] = useState({});
  const [campaignMapDraft, setCampaignMapDraft] = useState({});
  const [dashboardForumCampaignId, setDashboardForumCampaignId] = useState(null);
  const [campaignForumThreads, setCampaignForumThreads] = useState({});
  const [campaignForumDraft, setCampaignForumDraft] = useState({});
  const [centerTab, setCenterTab] = useState('map');
  const [mapForumThreads, setMapForumThreads] = useState([]);
  const [selectedForumThread, setSelectedForumThread] = useState(null);
  const [forumReplyDraft, setForumReplyDraft] = useState('');
  const [mapForumDraft, setMapForumDraft] = useState({ title: '', body: '' });
  const [forumPageThread, setForumPageThread] = useState(null);
  const [forumPageReplyDraft, setForumPageReplyDraft] = useState('');
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
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'register' || mode === 'login') setAuthMode(mode);
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
    if (forumRouteMatch?.[1]) {
      refreshCampaignForumThreads(forumRouteMatch[1]);
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
    if (!isContactRoute || !authConfig.recaptchaSiteKey || authConfig.recaptchaType !== 'v2') return;

    let cancelled = false;
    loadRecaptchaScript(authConfig.recaptchaSiteKey, 'v2')
      .then(() => {
        if (cancelled || !contactRecaptchaRef.current || !window.grecaptcha?.render || contactRecaptchaWidgetRef.current !== null) return;
        contactRecaptchaWidgetRef.current = window.grecaptcha.render(contactRecaptchaRef.current, {
          sitekey: authConfig.recaptchaSiteKey
        });
      })
      .catch(showError);

    return () => {
      cancelled = true;
      contactRecaptchaWidgetRef.current = null;
    };
  }, [authConfig.recaptchaSiteKey, authConfig.recaptchaType, isContactRoute]);

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
    setCenterTab('map');
    setMapForumThreads([]);
    setSelectedForumThread(null);
    setForumReplyDraft('');
    setMapForumDraft({ title: '', body: '' });
  }, [activeMap?.id]);

  useEffect(() => {
    if (centerTab !== 'forums' || !activeMap?.campaignId) return;
    refreshMapForumThreads();
  }, [centerTab, activeMap?.id, activeMap?.campaignId]);

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
      if (isAuthRoute || isSplashRoute) {
        window.location.href = '/dashboard';
      }
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

  async function handleContactSubmit(event) {
    event.preventDefault();
    try {
      const latestAuthConfig = await getAuthConfig();
      setAuthConfig(latestAuthConfig);
      const recaptchaToken = await getRecaptchaToken(latestAuthConfig, contactRecaptchaWidgetRef.current, 'contact');
      if (latestAuthConfig.requireRecaptcha && !recaptchaToken) {
        throw new Error('Could not create a reCAPTCHA token. Refresh the page and try again.');
      }

      const data = await sendContactMessage({ ...contactDraft, recaptchaToken });
      window.grecaptcha?.reset?.(contactRecaptchaWidgetRef.current);
      setContactDraft({ name: '', email: '', subject: '', message: '' });
      setMessage(data.message || 'Your message has been sent.');
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

  async function toggleCampaignForums(campaignId) {
    const nextCampaignId = dashboardForumCampaignId === campaignId ? null : campaignId;
    setDashboardForumCampaignId(nextCampaignId);
    if (nextCampaignId) await refreshCampaignForumThreads(nextCampaignId);
  }

  async function refreshCampaignForumThreads(campaignId) {
    try {
      const data = await listForumThreads(campaignId);
      setCampaignForumThreads((current) => ({ ...current, [campaignId]: data.threads }));
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateCampaignForumThread(campaign) {
    const draft = campaignForumDraft[campaign.id] || {};
    const title = String(draft.title || '').trim();
    const body = String(draft.body || '').trim();
    const mapId = draft.mapId ? Number.parseInt(draft.mapId, 10) : null;
    if (!title || !body) return;

    try {
      await createForumThread(campaign.id, { title, body, mapId });
      setCampaignForumDraft((current) => ({ ...current, [campaign.id]: {} }));
      setMessage(`Created forum thread ${title}`);
      setError('');
      await refreshCampaignForumThreads(campaign.id);
    } catch (err) {
      showError(err);
    }
  }

  async function handleAssignCampaignForumThread(campaign, threadId, mapIdValue) {
    const mapId = mapIdValue ? Number.parseInt(mapIdValue, 10) : null;
    try {
      await assignForumThreadMap(campaign.id, threadId, mapId);
      setMessage(mapId ? 'Forum thread assigned to map' : 'Forum thread detached from map');
      setError('');
      await refreshCampaignForumThreads(campaign.id);
      if (activeMap?.campaignId === campaign.id && centerTab === 'forums') {
        await refreshMapForumThreads();
      }
    } catch (err) {
      showError(err);
    }
  }

  async function refreshMapForumThreads() {
    if (!activeMap?.campaignId || !activeMap?.id) return;
    try {
      const data = await listForumThreads(activeMap.campaignId, activeMap.id);
      setMapForumThreads(data.threads);
      if (selectedForumThread && !data.threads.some((thread) => thread.id === selectedForumThread.id)) {
        setSelectedForumThread(null);
      }
    } catch (err) {
      showError(err);
    }
  }

  async function handleSelectMapForumThread(threadId) {
    if (!activeMap?.campaignId) return;
    try {
      const data = await getForumThread(activeMap.campaignId, threadId);
      setSelectedForumThread(data.thread);
      setForumReplyDraft('');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateMapForumThread(event) {
    event.preventDefault();
    if (!activeMap?.campaignId || !activeMap?.id) return;
    const title = mapForumDraft.title.trim();
    const body = mapForumDraft.body.trim();
    if (!title || !body) return;

    try {
      const data = await createForumThread(activeMap.campaignId, {
        title,
        body,
        mapId: activeMap.id
      });
      setMapForumDraft({ title: '', body: '' });
      setSelectedForumThread(data.thread);
      setMessage(`Created forum thread ${title}`);
      setError('');
      await refreshMapForumThreads();
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateMapForumPost(event) {
    event.preventDefault();
    const body = forumReplyDraft.trim();
    if (!activeMap?.campaignId || !selectedForumThread?.id || !body) return;

    try {
      const data = await createForumPost(activeMap.campaignId, selectedForumThread.id, body);
      setSelectedForumThread(data.thread);
      setForumReplyDraft('');
      setMessage('Reply posted');
      setError('');
      await refreshMapForumThreads();
    } catch (err) {
      showError(err);
    }
  }

  async function handleSelectCampaignForumThread(campaignId, threadId) {
    try {
      const data = await getForumThread(campaignId, threadId);
      setForumPageThread(data.thread);
      setForumPageReplyDraft('');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateCampaignForumPost(event, campaignId) {
    event.preventDefault();
    const body = forumPageReplyDraft.trim();
    if (!campaignId || !forumPageThread?.id || !body) return;

    try {
      const data = await createForumPost(campaignId, forumPageThread.id, body);
      setForumPageThread(data.thread);
      setForumPageReplyDraft('');
      setMessage('Reply posted');
      setError('');
      await refreshCampaignForumThreads(campaignId);
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

  if (isSplashRoute) {
    return <SplashPage authUser={authUser} />;
  }

  if (isContactRoute) {
    return (
      <ContactPage
        authUser={authUser}
        authConfig={authConfig}
        contactDraft={contactDraft}
        error={error}
        message={message}
        recaptchaRef={contactRecaptchaRef}
        onContactDraftChange={setContactDraft}
        onSubmit={handleContactSubmit}
      />
    );
  }

  if (!authUser) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <BrandLockup subtitle="Play-by-post RPG hub" />
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
        <SiteFooter compact />
      </main>
    );
  }

  if (forumRouteMatch) {
    const campaignId = Number.parseInt(forumRouteMatch[1], 10);
    const campaign = campaigns.find((item) => Number(item.id) === campaignId);
    return (
      <ForumPage
        campaign={campaign}
        threads={campaignForumThreads[campaignId] || []}
        selectedThread={forumPageThread}
        threadDraft={campaignForumDraft[campaignId] || {}}
        replyDraft={forumPageReplyDraft}
        message={message}
        error={error}
        authUser={authUser}
        onLogout={handleLogout}
        onRefresh={() => refreshCampaignForumThreads(campaignId)}
        onSelectThread={(threadId) => handleSelectCampaignForumThread(campaignId, threadId)}
        onThreadDraftChange={(draft) => setCampaignForumDraft((current) => ({
          ...current,
          [campaignId]: typeof draft === 'function' ? draft(current[campaignId] || {}) : draft
        }))}
        onCreateThread={() => campaign && handleCreateCampaignForumThread(campaign)}
        onAssignThread={(threadId, mapId) => campaign && handleAssignCampaignForumThread(campaign, threadId, mapId)}
        onReplyDraftChange={setForumPageReplyDraft}
        onCreatePost={(event) => handleCreateCampaignForumPost(event, campaignId)}
      />
    );
  }

  if (!mapRouteMatch) {
    return (
      <main className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <BrandLockup title="Campaign Dashboard" subtitle={`Signed in as ${authUser.displayName}`} />
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
                  <div className="button-row">
                    <a className="button" href={`/campaigns/${campaign.id}/forums`}>Open forums</a>
                    <button type="button" onClick={() => toggleCampaignForums(campaign.id)}>
                      {dashboardForumCampaignId === campaign.id ? 'Hide preview' : 'Preview'}
                    </button>
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

                {dashboardForumCampaignId === campaign.id && (
                  <section className="campaign-forum-panel">
                    <div className="campaign-forum-header">
                      <strong>Campaign Forums</strong>
                      <small>Supports basic BBCode: [b], [i], [u], [quote], [code], [url]</small>
                    </div>

                    <div className="forum-thread-list compact">
                      {(campaignForumThreads[campaign.id] || []).map((thread) => (
                        <article className="forum-thread-row" key={thread.id}>
                          <div>
                            <strong>{thread.title}</strong>
                            <small>
                              {thread.postCount} posts · by {thread.createdByDisplayName || thread.createdByUserId} · {thread.mapName ? `Map: ${thread.mapName}` : 'Campaign-wide'}
                            </small>
                          </div>
                          {campaign.role === 'owner' && (
                            <select
                              value={thread.mapId || ''}
                              onChange={(event) => handleAssignCampaignForumThread(campaign, thread.id, event.target.value)}
                              aria-label={`Assign ${thread.title} to a map`}
                            >
                              <option value="">Campaign-wide</option>
                              {campaign.maps.map((map) => (
                                <option key={map.id} value={map.id}>{map.name}</option>
                              ))}
                            </select>
                          )}
                        </article>
                      ))}
                      {!(campaignForumThreads[campaign.id] || []).length && <p>No forum threads yet.</p>}
                    </div>

                    <div className="forum-compose">
                      <input
                        value={campaignForumDraft[campaign.id]?.title || ''}
                        onChange={(event) => setCampaignForumDraft((current) => ({
                          ...current,
                          [campaign.id]: { ...(current[campaign.id] || {}), title: event.target.value }
                        }))}
                        placeholder="Thread title"
                      />
                      <select
                        value={campaignForumDraft[campaign.id]?.mapId || ''}
                        onChange={(event) => setCampaignForumDraft((current) => ({
                          ...current,
                          [campaign.id]: { ...(current[campaign.id] || {}), mapId: event.target.value }
                        }))}
                        aria-label="Assign new thread to map"
                      >
                        <option value="">Campaign-wide thread</option>
                        {campaign.maps.map((map) => (
                          <option key={map.id} value={map.id}>{map.name}</option>
                        ))}
                      </select>
                      <BBCodeEditor
                        value={campaignForumDraft[campaign.id]?.body || ''}
                        onChange={(value) => setCampaignForumDraft((current) => ({
                          ...current,
                          [campaign.id]: { ...(current[campaign.id] || {}), body: value }
                        }))}
                        placeholder="First post with BBCode"
                      />
                      <button type="button" onClick={() => handleCreateCampaignForumThread(campaign)}>Create thread</button>
                    </div>
                  </section>
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
        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <BrandLockup title="PBPHud Map Editor" subtitle={activeMap?.campaign?.name || 'Campaign map and forum workspace'} />
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
          <div className="center-tabs" role="tablist" aria-label="Center panel">
            <button
              type="button"
              className={centerTab === 'map' ? 'selected' : ''}
              onClick={() => setCenterTab('map')}
              role="tab"
              aria-selected={centerTab === 'map'}
            >
              Map
            </button>
            <button
              type="button"
              className={centerTab === 'forums' ? 'selected' : ''}
              onClick={() => setCenterTab('forums')}
              role="tab"
              aria-selected={centerTab === 'forums'}
              disabled={!activeMap?.campaignId}
            >
              Forums
            </button>
          </div>

          {centerTab === 'map' ? (
            <>
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
            </>
          ) : (
            <MapForumPanel
              activeMap={activeMap}
              threads={mapForumThreads}
              selectedThread={selectedForumThread}
              threadDraft={mapForumDraft}
              replyDraft={forumReplyDraft}
              onThreadDraftChange={setMapForumDraft}
              onReplyDraftChange={setForumReplyDraft}
              onCreateThread={handleCreateMapForumThread}
              onSelectThread={handleSelectMapForumThread}
              onCreatePost={handleCreateMapForumPost}
            />
          )}
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
      <SiteFooter compact />
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

async function getRecaptchaToken(config, widgetId, action = config.recaptchaAction || 'register') {
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
      window.grecaptcha.execute(siteKey, { action }).then(resolve).catch(reject);
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

function SplashPage({ authUser }) {
  return (
    <main className="splash-page">
      <header className="site-header">
        <a className="brand-link" href="/" aria-label="PBPHUD home">
          <BrandLockup />
        </a>
        <nav className="main-nav" aria-label="Site pages">
          <a href="#overview">Overview</a>
          <a href="#forums">Forums</a>
          <a href="#maps">Maps</a>
          <a href={authUser ? '/dashboard' : '/auth'}>{authUser ? 'Dashboard' : 'Sign in'}</a>
        </nav>
        <a className="button button-primary" href={authUser ? '/dashboard' : '/auth?mode=register'}>
          {authUser ? 'Enter dashboard' : 'Start a campaign'}
        </a>
      </header>

      <section className="splash-hero">
        <div className="hero-copy">
          <p className="eyebrow">Fantasy forums and virtual tabletop</p>
          <h1>Gather the party between posts, maps, and moments.</h1>
          <p className="hero-lede">
            PBPHUD brings campaign forums, shared maps, BBCode posts, and player access controls into one play-by-post hub.
          </p>
          <div className="button-row">
            <a className="button button-primary" href={authUser ? '/dashboard' : '/auth?mode=register'}>Create your campaign</a>
            <a className="button button-ghost" href="#overview">See the tools</a>
          </div>
        </div>
      </section>

      <section id="overview" className="splash-section">
        <div className="section-heading">
          <p className="eyebrow">Site overview</p>
          <h2>Built for slow-burn adventures.</h2>
          <p>Use the dashboard as your campaign gateway, keep long-form scenes in forums, and open maps when the table needs positioning.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-icon">01</span>
            <h3>Campaign dashboard</h3>
            <p>Create campaigns, invite players, and jump straight to each campaign’s maps and forums.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">02</span>
            <h3>Forum play</h3>
            <p>Threaded campaign discussion with BBCode, previews, poster names, and map-linked topics.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">03</span>
            <h3>Map workspace</h3>
            <p>Paint terrain, place objects and entities, draw measurements, and share visibility with players.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon">04</span>
            <h3>Play-by-post flow</h3>
            <p>Move from narrative posts to tactical maps without losing campaign context.</p>
          </article>
        </div>
      </section>

      <section id="forums" className="splash-section split-preview">
        <div>
          <p className="eyebrow">Classic forum rhythm</p>
          <h2>Threads that feel familiar.</h2>
          <p>Campaign forums are organized around readable thread lists, post metadata, and a BBCode editor with a live preview.</p>
        </div>
        <div className="forum-shell-preview">
          <article className="thread-row is-unread">
            <div className="thread-status">New</div>
            <div>
              <h3>Chapter 4: Lanterns Under Blackpine</h3>
              <p>Last post by Mira Dawnwatch</p>
            </div>
            <div className="thread-count">42 replies</div>
          </article>
          <article className="thread-row">
            <div className="thread-status">OOC</div>
            <div>
              <h3>Rules questions and marching order</h3>
              <p>Assigned to Blackpine Ford</p>
            </div>
            <div className="thread-count">9 replies</div>
          </article>
        </div>
      </section>

      <section id="maps" className="splash-section split-preview">
        <div>
          <p className="eyebrow">Virtual tabletop</p>
          <h2>Maps when the scene needs space.</h2>
          <p>The map page focuses on the board first, with tools and campaign forum threads nearby when you need them.</p>
        </div>
        <div className="map-stage-preview" aria-hidden="true">
          <span className="map-token token-a">A</span>
          <span className="map-token token-b">B</span>
          <span className="distance-ruler">35 ft</span>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function ContactPage({
  authUser,
  authConfig,
  contactDraft,
  error,
  message,
  recaptchaRef,
  onContactDraftChange,
  onSubmit
}) {
  return (
    <main className="contact-page">
      <header className="site-header">
        <a className="brand-link" href="/" aria-label="PBPHUD home">
          <BrandLockup />
        </a>
        <nav className="main-nav" aria-label="Site pages">
          <a href="/">Home</a>
          <a href={authUser ? '/dashboard' : '/auth'}>{authUser ? 'Dashboard' : 'Sign in'}</a>
          <a href="/contact">Contact</a>
        </nav>
      </header>

      <section className="contact-layout">
        <div className="section-heading">
          <p className="eyebrow">Contact us</p>
          <h1>Send a message to PBPHUD.</h1>
          <p>Questions, bug reports, table feedback, and account help all land here.</p>
        </div>

        <form className="contact-card" onSubmit={onSubmit}>
          <label>
            Name
            <input
              value={contactDraft.name}
              onChange={(event) => onContactDraftChange((current) => ({ ...current, name: event.target.value }))}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={contactDraft.email}
              onChange={(event) => onContactDraftChange((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label>
            Subject
            <input
              value={contactDraft.subject}
              onChange={(event) => onContactDraftChange((current) => ({ ...current, subject: event.target.value }))}
              placeholder="How can we help?"
            />
          </label>
          <label>
            Message
            <textarea
              value={contactDraft.message}
              onChange={(event) => onContactDraftChange((current) => ({ ...current, message: event.target.value }))}
              placeholder="Tell us what is going on."
              rows={8}
            />
          </label>
          {authConfig.recaptchaSiteKey && authConfig.recaptchaType === 'v2' && (
            <div className="recaptcha-control" ref={recaptchaRef} />
          )}
          <button type="submit">Send message</button>
          {(message || error) && <p className={`auth-message ${error ? 'error' : ''}`}>{error || message}</p>}
        </form>
      </section>

      <SiteFooter />
    </main>
  );
}

function ForumPage({
  campaign,
  threads,
  selectedThread,
  threadDraft,
  replyDraft,
  message,
  error,
  authUser,
  onLogout,
  onRefresh,
  onSelectThread,
  onThreadDraftChange,
  onCreateThread,
  onAssignThread,
  onReplyDraftChange,
  onCreatePost
}) {
  return (
    <main className="forum-page">
      <header className="dashboard-header">
        <div>
          <BrandLockup title={campaign?.name || 'Campaign Forums'} subtitle={campaign ? `${threads.length} threads` : 'Loading campaign'} />
        </div>
        <div className="button-row">
          <a className="button" href="/dashboard">Dashboard</a>
          <button type="button" onClick={onRefresh} disabled={!campaign}>Refresh</button>
          <button type="button" onClick={onLogout}>Sign out {authUser?.displayName ? `(${authUser.displayName})` : ''}</button>
        </div>
      </header>

      <section className="forum-page-layout">
        <aside className="forum-index-panel">
          <div className="forum-panel-header">
            <strong>Threads</strong>
            {campaign && <small>{campaign.role === 'owner' ? 'Owner' : 'Member'}</small>}
          </div>
          <div className="forum-thread-list">
            {threads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={selectedThread?.id === thread.id ? 'selected' : ''}
                onClick={() => onSelectThread(thread.id)}
              >
                <span>{thread.title}</span>
                <small>
                  {thread.postCount} posts · by {thread.createdByDisplayName || thread.createdByUserId}
                  {thread.mapName ? ` · ${thread.mapName}` : ''}
                </small>
              </button>
            ))}
            {!threads.length && <p>No forum threads yet.</p>}
          </div>
        </aside>

        <section className="forum-main-panel">
          {!campaign ? (
            <div className="empty-state">Loading campaign forum...</div>
          ) : selectedThread ? (
            <>
              <header className="forum-thread-header">
                <div>
                  <h2>{selectedThread.title}</h2>
                  <p>{selectedThread.mapName ? `Assigned to ${selectedThread.mapName}` : 'Campaign-wide thread'}</p>
                </div>
                {campaign.role === 'owner' && (
                  <select
                    value={selectedThread.mapId || ''}
                    onChange={(event) => onAssignThread(selectedThread.id, event.target.value)}
                    aria-label="Assign thread to map"
                  >
                    <option value="">Campaign-wide</option>
                    {campaign.maps.map((map) => (
                      <option key={map.id} value={map.id}>{map.name}</option>
                    ))}
                  </select>
                )}
              </header>
              <div className="forum-post-list">
                {selectedThread.posts.map((post) => (
                  <article className="forum-post" key={post.id}>
                    <aside className="post-author">
                      <div className="avatar">{(post.authorDisplayName || post.authorUserId || '?').slice(0, 1).toUpperCase()}</div>
                      <strong>{post.authorDisplayName || post.authorUserId}</strong>
                      <span>{post.authorUserId}</span>
                    </aside>
                    <div className="post-body">
                      <header>
                        <time>{formatDateTime(post.createdAt)}</time>
                      </header>
                      <div className="bbcode-body" dangerouslySetInnerHTML={{ __html: renderBbcode(post.body) }} />
                    </div>
                  </article>
                ))}
              </div>
              <form className="forum-reply-form" onSubmit={onCreatePost}>
                <BBCodeEditor value={replyDraft} onChange={onReplyDraftChange} placeholder="Reply with BBCode" />
                <button type="submit">Post reply</button>
              </form>
            </>
          ) : (
            <div className="empty-state">Select a thread to read it.</div>
          )}
        </section>

        <aside className="forum-compose-panel">
          <div className="forum-panel-header">
            <strong>New Thread</strong>
            <small>BBCode enabled</small>
          </div>
          <form
            className="forum-compose"
            onSubmit={(event) => {
              event.preventDefault();
              onCreateThread();
            }}
          >
            <input
              value={threadDraft.title || ''}
              onChange={(event) => onThreadDraftChange((current) => ({ ...current, title: event.target.value }))}
              placeholder="Thread title"
            />
            <select
              value={threadDraft.mapId || ''}
              onChange={(event) => onThreadDraftChange((current) => ({ ...current, mapId: event.target.value }))}
              disabled={!campaign}
              aria-label="Assign new thread to map"
            >
              <option value="">Campaign-wide thread</option>
              {(campaign?.maps || []).map((map) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </select>
            <BBCodeEditor
              value={threadDraft.body || ''}
              onChange={(value) => onThreadDraftChange((current) => ({ ...current, body: value }))}
              placeholder="First post"
            />
            <button type="submit" disabled={!campaign}>Create thread</button>
          </form>
        </aside>
      </section>

      {(message || error) && <footer className={`status ${error ? 'error' : ''}`}>{error || message}</footer>}
      <SiteFooter />
    </main>
  );
}

function BrandLockup({ title = 'PBPHUD', subtitle = 'Play-by-post RPG hub' }) {
  return (
    <div className="brand-lockup">
      <span className="brand-mark" aria-hidden="true">P</span>
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </div>
  );
}

function SiteFooter({ compact = false }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`site-footer ${compact ? 'compact' : ''}`}>
      <div>
        <strong>PBPHUD</strong>
        <span>Copyright © {year} PBPHUD. All rights reserved.</span>
      </div>
      <nav aria-label="Footer links">
        <a href="/tos.md">Terms of Service</a>
        <a href="/privacy.md">Privacy Policy</a>
        <a href="/contact">Contact us</a>
      </nav>
      <nav className="footer-sitemap" aria-label="Sitemap">
        <span>Sitemap</span>
        <a href="/">Splash</a>
        <a href="/auth">Sign in</a>
        <a href="/auth?mode=register">Register</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/contact">Contact</a>
      </nav>
    </footer>
  );
}

function MapForumPanel({
  activeMap,
  threads,
  selectedThread,
  threadDraft,
  replyDraft,
  onThreadDraftChange,
  onReplyDraftChange,
  onCreateThread,
  onSelectThread,
  onCreatePost
}) {
  if (!activeMap?.campaignId) {
    return <div className="empty-state">Forums are available for campaign maps.</div>;
  }

  return (
    <section className="map-forum-panel">
      <aside className="map-forum-sidebar">
        <div className="forum-panel-header">
          <strong>Map Threads</strong>
          <small>{activeMap.mapName}</small>
        </div>
        <div className="forum-thread-list">
          {threads.map((thread) => (
            <button
              type="button"
              key={thread.id}
              className={selectedThread?.id === thread.id ? 'selected' : ''}
              onClick={() => onSelectThread(thread.id)}
            >
              <span>{thread.title}</span>
              <small>{thread.postCount} posts · by {thread.createdByDisplayName || thread.createdByUserId}</small>
            </button>
          ))}
          {!threads.length && <p>No threads assigned to this map.</p>}
        </div>
        <form className="forum-compose" onSubmit={onCreateThread}>
          <input
            value={threadDraft.title}
            onChange={(event) => onThreadDraftChange((current) => ({ ...current, title: event.target.value }))}
            placeholder="Thread title"
          />
          <BBCodeEditor
            value={threadDraft.body}
            onChange={(value) => onThreadDraftChange((current) => ({ ...current, body: value }))}
            placeholder="First post with BBCode"
          />
          <button type="submit">Create map thread</button>
        </form>
      </aside>

      <section className="forum-thread-view">
        {selectedThread ? (
          <>
            <header className="forum-thread-header">
              <div>
                <h2>{selectedThread.title}</h2>
                <p>{selectedThread.mapName ? `Assigned to ${selectedThread.mapName}` : 'Campaign-wide'}</p>
              </div>
            </header>
            <div className="forum-post-list">
              {selectedThread.posts.map((post) => (
                <article className="forum-post" key={post.id}>
                  <header>
                    <strong>{post.authorDisplayName || post.authorUserId}</strong>
                    <time>{formatDateTime(post.createdAt)}</time>
                  </header>
                  <div
                    className="bbcode-body"
                    dangerouslySetInnerHTML={{ __html: renderBbcode(post.body) }}
                  />
                </article>
              ))}
            </div>
            <form className="forum-reply-form" onSubmit={onCreatePost}>
              <BBCodeEditor
                value={replyDraft}
                onChange={onReplyDraftChange}
                placeholder="Reply with BBCode"
              />
              <button type="submit">Post reply</button>
            </form>
          </>
        ) : (
          <div className="empty-state">Select a thread or create one for this map.</div>
        )}
      </section>
    </section>
  );
}

function BBCodeEditor({ value, onChange, placeholder }) {
  const textareaRef = useRef(null);

  function wrapSelection(openTag, closeTag = null, fallback = '') {
    const textarea = textareaRef.current;
    const endTag = closeTag ?? openTag.replace('[', '[/');
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selectedText = textarea
      ? value.slice(start, end)
      : '';
    const inner = selectedText || fallback;
    const nextText = textarea
      ? `${value.slice(0, start)}${openTag}${inner}${endTag}${value.slice(end)}`
      : `${value}${openTag}${inner}${endTag}`;

    onChange(nextText);
    window.requestAnimationFrame(() => {
      if (!textarea) return;
      const selectionStart = start + openTag.length;
      const selectionEnd = selectionStart + inner.length;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function insertUrl() {
    const url = window.prompt('Enter URL');
    if (!url) return;
    wrapSelection(`[url=${url}]`, '[/url]', url);
  }

  function insertEmail() {
    const email = window.prompt('Enter email address');
    if (!email) return;
    wrapSelection(`[email=${email}]`, '[/email]', email);
  }

  function insertImage() {
    const url = window.prompt('Enter image URL');
    if (!url) return;
    wrapSelection('[img]', '[/img]', url);
  }

  function insertColor() {
    const color = window.prompt('Enter color name or hex code', '#2563eb');
    if (!color) return;
    wrapSelection(`[color=${color}]`, '[/color]', 'colored text');
  }

  function insertSize() {
    const size = window.prompt('Enter text size from 8 to 36', '18');
    if (!size) return;
    wrapSelection(`[size=${size}]`, '[/size]', 'sized text');
  }

  function insertList(type = '') {
    const openTag = type ? `[list=${type}]` : '[list]';
    wrapSelection(openTag, '[/list]', '[*]First item\n[*]Second item');
  }

  function insertQuoteWithAuthor() {
    const author = window.prompt('Quoted author');
    if (!author) {
      wrapSelection('[quote]', '[/quote]', 'quoted text');
      return;
    }
    wrapSelection(`[quote=${author}]`, '[/quote]', 'quoted text');
  }

  return (
    <div className="bbcode-editor">
      <div className="bbcode-toolbar" aria-label="BBCode formatting">
        <button type="button" onClick={() => wrapSelection('[b]', '[/b]', 'bold text')}>Bold</button>
        <button type="button" onClick={() => wrapSelection('[i]', '[/i]', 'italic text')}>Italic</button>
        <button type="button" onClick={() => wrapSelection('[u]', '[/u]', 'underlined text')}>Underline</button>
        <button type="button" onClick={() => wrapSelection('[s]', '[/s]', 'struck text')}>Strike</button>
        <button type="button" onClick={insertColor}>Color</button>
        <button type="button" onClick={insertSize}>Size</button>
        <button type="button" onClick={() => wrapSelection('[center]', '[/center]', 'centered text')}>Center</button>
        <button type="button" onClick={insertQuoteWithAuthor}>Quote</button>
        <button type="button" onClick={() => wrapSelection('[code]', '[/code]', 'code')}>Code</button>
        <button type="button" onClick={() => insertList('')}>List</button>
        <button type="button" onClick={() => insertList('1')}>Numbered List</button>
        <button type="button" onClick={insertUrl}>Link</button>
        <button type="button" onClick={insertEmail}>Email</button>
        <button type="button" onClick={insertImage}>Image</button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={6}
      />
      <div className="bbcode-preview">
        <strong>Preview</strong>
        {value.trim() ? (
          <div
            className="bbcode-body"
            dangerouslySetInnerHTML={{ __html: renderBbcode(value) }}
          />
        ) : (
          <p>No preview yet.</p>
        )}
      </div>
    </div>
  );
}

function renderBbcode(input) {
  let html = escapeHtml(input);
  html = html
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>')
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
    .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>')
    .replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, '<s>$1</s>')
    .replace(/\[center\]([\s\S]*?)\[\/center\]/gi, '<div class="bbcode-align-center">$1</div>')
    .replace(/\[left\]([\s\S]*?)\[\/left\]/gi, '<div class="bbcode-align-left">$1</div>')
    .replace(/\[right\]([\s\S]*?)\[\/right\]/gi, '<div class="bbcode-align-right">$1</div>')
    .replace(/\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi, '<blockquote><cite>$1 wrote:</cite>$2</blockquote>')
    .replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>')
    .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre><code>$1</code></pre>')
    .replace(/\[color=([#\w(),.%\s-]+)\]([\s\S]*?)\[\/color\]/gi, (_match, color, text) => {
      const safeColor = sanitizeCssColor(color);
      return safeColor ? `<span style="color: ${safeColor}">${text}</span>` : text;
    })
    .replace(/\[size=([+\-\w.%]+)\]([\s\S]*?)\[\/size\]/gi, (_match, size, text) => {
      const safeSize = sanitizeFontSize(size);
      return safeSize ? `<span style="font-size: ${safeSize}">${text}</span>` : text;
    })
    .replace(/\[email\]([^\s<]+@[^\s<]+)\[\/email\]/gi, '<a href="mailto:$1">$1</a>')
    .replace(/\[email=([^\s\]]+@[^\s\]]+)\]([\s\S]*?)\[\/email\]/gi, '<a href="mailto:$1">$2</a>')
    .replace(/\[url\](https?:\/\/[^\s[]+?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[url=(https?:\/\/[^\s\]]+?)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>')
    .replace(/\[img\](https?:\/\/[^\s[]+?)\[\/img\]/gi, '<img src="$1" alt="" loading="lazy" />');
  html = renderBbcodeLists(html);
  html = html
    .replace(/\r?\n/g, '<br />');
  return html;
}

function renderBbcodeLists(html) {
  return html
    .replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_match, content) => renderListItems(content, 'ul'))
    .replace(/\[list=([1AaIi])\]([\s\S]*?)\[\/list\]/gi, (_match, type, content) => renderListItems(content, 'ol', type));
}

function renderListItems(content, tagName, type = '') {
  const items = content
    .split(/\[\*\]/i)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) return '';
  const typeAttribute = tagName === 'ol' && type ? ` type="${type}"` : '';
  return `<${tagName}${typeAttribute}>${items.map((item) => `<li>${item}</li>`).join('')}</${tagName}>`;
}

function sanitizeCssColor(color) {
  const value = String(color || '').trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) return value;
  if (/^[a-z]+$/i.test(value)) return value.toLowerCase();
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(value)) return value;
  return '';
}

function sanitizeFontSize(size) {
  const value = String(size || '').trim();
  const relativeSizes = {
    '-2': '0.75em',
    '-1': '0.85em',
    '+1': '1.15em',
    '+2': '1.3em',
    '+3': '1.5em'
  };
  if (relativeSizes[value]) return relativeSizes[value];

  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return '';
  return `${Math.min(Math.max(numeric, 8), 36)}px`;
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
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
