import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  assignForumThreadMap,
  createEntity,
  createCampaign,
  createCampaignCast,
  createCampaignMap,
  createForumPost,
  createForumThread,
  createCampaignOwnershipTransfer,
  createMap,
  createPublicForumPost,
  createPublicForumThread,
  deleteCampaignCast,
  deleteForumPost,
  deletePublicForumPost,
  getAuthConfig,
  getAdminDemoAssignmentOptions,
  getCurrentUser,
  getDemoAssignment,
  getForumThread,
  getCampaignOwnershipTransfer,
  getMap,
  getMapById,
  getPublicForumThread,
  getViewerUserId,
  inviteCampaignMember,
  inviteMapUser,
  joinCampaignAsLurker,
  listCampaigns,
  listCampaignCast,
  listAdminUsers,
  listForumPostIdentities,
  listForumThreads,
  listMaps,
  listPublicForumSections,
  listPublicForumThreads,
  listRecruitingCampaigns,
  listTileAssets,
  loginAccount,
  logoutAccount,
  markForumThreadRead,
  patchEntity,
  patchTile,
  registerAccount,
  resendVerificationEmail,
  respondCampaignOwnershipTransfer,
  saveMap,
  sendForumThreadTestNotification,
  setForumThreadVisibility,
  setPublicForumThreadSticky,
  setMapVisibility,
  setViewerUserId,
  shareMap,
  subscribeForumThread,
  updateCampaignCast,
  updateForumPost,
  updateAdminUserRole,
  updatePublicForumPost,
  unsubscribeForumThread,
  unshareMap,
  updateAccountProfile,
  updateCampaignRecruitment,
  updateDemoAssignment,
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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MAP_VISIBILITY_LEVELS = [
  { value: 'public', label: 'Public' },
  { value: 'campaign', label: 'Campaign Only' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'demo', label: 'Demo' }
];
const FORUM_THREAD_VISIBILITY_LEVELS = [
  { value: 'demo', label: 'Demo' },
  { value: 'public', label: 'Public' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'hidden', label: 'Hidden' }
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
  const publicForumRouteMatch = path.match(/^\/forums(?:\/([^/]+)(?:\/threads\/(\d+))?)?$/);
  const isPublicForumsRoute = Boolean(publicForumRouteMatch);
  const publicForumSectionSlug = publicForumRouteMatch?.[1] ? decodeURIComponent(publicForumRouteMatch[1]) : '';
  const publicForumThreadId = publicForumRouteMatch?.[2] || '';
  const isGamesListRoute = path === '/games';
  const isDemoRoute = path === '/demo';
  const isAuthRoute = path === '/auth';
  const isContactRoute = path === '/contact';
  const isDashboardRoute = path === '/dashboard';
  const isOwnershipTransferRoute = path === '/campaign-ownership-transfer';
  const isAdminRoute = path === '/admin';
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
  const [panels, setPanels] = useState({ top: true, right: true });
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
  const [campaignRecruitmentDraft, setCampaignRecruitmentDraft] = useState({});
  const [campaignOwnershipTransferDraft, setCampaignOwnershipTransferDraft] = useState({});
  const [ownershipTransferInvite, setOwnershipTransferInvite] = useState(null);
  const [campaignMapDraft, setCampaignMapDraft] = useState({});
  const [campaignCast, setCampaignCast] = useState({});
  const [campaignCastDraft, setCampaignCastDraft] = useState({});
  const [portraitCrop, setPortraitCrop] = useState(null);
  const [campaignForumThreads, setCampaignForumThreads] = useState({});
  const [campaignPostIdentities, setCampaignPostIdentities] = useState({});
  const [campaignForumDraft, setCampaignForumDraft] = useState({});
  const [centerTab, setCenterTab] = useState('map');
  const [dashboardModal, setDashboardModal] = useState(null);
  const [mapForumThreads, setMapForumThreads] = useState([]);
  const [selectedForumThread, setSelectedForumThread] = useState(null);
  const [forumReplyDraft, setForumReplyDraft] = useState('');
  const [mapForumDraft, setMapForumDraft] = useState({ title: '', body: '' });
  const [forumPageThread, setForumPageThread] = useState(null);
  const [forumPageReplyDraft, setForumPageReplyDraft] = useState('');
  const [publicForumSections, setPublicForumSections] = useState([]);
  const [publicForumThreadsBySection, setPublicForumThreadsBySection] = useState({});
  const [publicForumThread, setPublicForumThread] = useState(null);
  const [publicForumNewThreadSection, setPublicForumNewThreadSection] = useState(null);
  const [publicForumThreadDraft, setPublicForumThreadDraft] = useState({ title: '', body: '' });
  const [publicForumReplyDraft, setPublicForumReplyDraft] = useState('');
  const [recruitingCampaigns, setRecruitingCampaigns] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [demoAssignment, setDemoAssignment] = useState(null);
  const [adminDemoOptions, setAdminDemoOptions] = useState({ campaigns: [], maps: [], threads: [] });
  const [adminDemoDraft, setAdminDemoDraft] = useState({ campaignId: '', mapId: '', threadId: '' });
  const [testNotificationInfo, setTestNotificationInfo] = useState(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountDraft, setAccountDraft] = useState(buildAccountDraft(null));
  const [accountPortraitCrop, setAccountPortraitCrop] = useState(null);
  const [portraitRefreshKey, setPortraitRefreshKey] = useState(() => Date.now());
  const [editingPost, setEditingPost] = useState(null);
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

  const localAdminDemoOptions = useMemo(() => {
    return buildAdminDemoOptionsFromCampaignState(campaigns, campaignForumThreads);
  }, [campaigns, campaignForumThreads]);
  const effectiveAdminDemoOptions = useMemo(() => {
    return mergeAdminDemoOptions(adminDemoOptions, localAdminDemoOptions);
  }, [localAdminDemoOptions, adminDemoOptions]);

  useEffect(() => {
    refreshMaps();
    refreshDemoAssignment();
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
  }, [authUser?.id, path]);

  useEffect(() => {
    if (!forumRouteMatch?.[1]) return;
    refreshCampaignForumThreads(forumRouteMatch[1]);
    if (authUser) refreshCampaignPostIdentities(forumRouteMatch[1]);
  }, [forumRouteMatch?.[1], authUser?.id]);

  useEffect(() => {
    if (!mapRouteMatch?.[1]) return;
    loadMapById(mapRouteMatch[1]);
  }, [mapRouteMatch?.[1], viewerUserId]);

  useEffect(() => {
    if (!isDemoRoute || demoAssignment === null) return;
    loadDemoPage();
  }, [isDemoRoute, demoAssignment?.campaignId, demoAssignment?.mapId, demoAssignment?.threadId, viewerUserId]);

  useEffect(() => {
    if (!isPublicForumsRoute) return;
    refreshPublicForumSections();
  }, [isPublicForumsRoute]);

  useEffect(() => {
    if (!isGamesListRoute) return;
    refreshRecruitingCampaigns();
  }, [isGamesListRoute]);

  useEffect(() => {
    if (!isPublicForumsRoute || !publicForumSectionSlug) {
      setPublicForumThread(null);
      return;
    }
    refreshPublicForumThreads(publicForumSectionSlug);
  }, [isPublicForumsRoute, publicForumSectionSlug]);

  useEffect(() => {
    if (!isPublicForumsRoute || !publicForumThreadId) {
      setPublicForumThread(null);
      return;
    }
    handleSelectPublicForumThread(publicForumThreadId);
  }, [isPublicForumsRoute, publicForumThreadId]);

  useEffect(() => {
    if (!authUser || !isAdminRoute || authUser.communityRole !== 'admin') return;
    refreshAdminUsers();
    refreshAdminDemoOptions();
  }, [authUser?.id, authUser?.communityRole, isAdminRoute]);

  useEffect(() => {
    if (!authUser || !isOwnershipTransferRoute) return;
    refreshOwnershipTransferInvite();
  }, [authUser?.id, isOwnershipTransferRoute, window.location.search]);

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
    if (!isContactRoute) return;
    window.location.replace('/');
  }, [isContactRoute]);

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
    refreshCampaignPostIdentities(activeMap.campaignId);
  }, [centerTab, activeMap?.id, activeMap?.campaignId]);

  useEffect(() => {
    if (!activeMap?.campaignId || !permissions.canManageEntities) return;
    refreshCampaignCast(activeMap.campaignId);
  }, [activeMap?.campaignId, permissions.canManageEntities]);

  useEffect(() => {
    scrollThreadToUnreadOrBottom(forumPageThread);
  }, [forumPageThread?.id, forumPageThread?.firstUnreadPostId, forumPageThread?.posts?.length]);

  useEffect(() => {
    scrollThreadToUnreadOrBottom(selectedForumThread);
  }, [selectedForumThread?.id, selectedForumThread?.firstUnreadPostId, selectedForumThread?.posts?.length]);

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
      if (!activeMap && data.maps[0] && !mapRouteMatch && !isDemoRoute) {
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

  function handleOpenAccountModal() {
    setAccountDraft(buildAccountDraft(authUser));
    setAccountModalOpen(true);
    setError('');
  }

  async function handleAccountPortraitFile(file) {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImage(dataUrl);
      if (image.naturalWidth === image.naturalHeight && image.naturalWidth <= 512) {
        setAccountDraft((current) => ({ ...current, profileImageUrl: dataUrl, useGravatar: false }));
        return;
      }
      setAccountPortraitCrop(createPortraitCropState('account', 'profile', dataUrl, image));
    } catch (err) {
      showError(err);
    }
  }

  async function handleApplyAccountPortraitCrop() {
    if (!accountPortraitCrop) return;
    try {
      const profileImageUrl = await cropPortraitToDataUrl(accountPortraitCrop);
      setAccountDraft((current) => ({ ...current, profileImageUrl, useGravatar: false }));
      setAccountPortraitCrop(null);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleSaveAccountProfile(event) {
    event.preventDefault();
    try {
      if (accountDraft.profileImageUrl) await validatePortraitSource(accountDraft.profileImageUrl);
      const data = await updateAccountProfile({
        displayName: accountDraft.displayName,
        profileAbout: accountDraft.profileAbout,
        profilePronouns: accountDraft.profilePronouns,
        profileTimezone: accountDraft.profileTimezone,
        profileImageUrl: accountDraft.profileImageUrl,
        useGravatar: accountDraft.useGravatar,
        autoSubscribeForumThreads: accountDraft.autoSubscribeForumThreads
      });
      setAuthUser(data.user);
      setAccountDraft(buildAccountDraft(data.user));
      setPortraitRefreshKey(Date.now());
      setAccountModalOpen(false);
      setMessage('Account settings saved');
      setError('');
      await refreshCampaigns();
    } catch (err) {
      showError(err);
    }
  }

  async function refreshCurrentUser() {
    try {
      const data = await getCurrentUser();
      if (data.user) setAuthUser(data.user);
    } catch (err) {
      showError(err);
    }
  }

  async function refreshCampaigns() {
    try {
      const data = await listCampaigns();
      setCampaigns(data.campaigns);
      await Promise.all(data.campaigns.map((campaign) => refreshCampaignForumThreads(campaign.id)));
    } catch (err) {
      if (authUser) showError(err);
    }
  }

  async function refreshRecruitingCampaigns() {
    try {
      const data = await listRecruitingCampaigns();
      setRecruitingCampaigns(data.campaigns || []);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function refreshDemoAssignment() {
    try {
      const data = await getDemoAssignment();
      setDemoAssignment(data.demoAssignment);
      return data.demoAssignment;
    } catch (err) {
      setDemoAssignment({});
      showError(err);
      return {};
    }
  }

  async function refreshAdminDemoOptions() {
    try {
      const data = await getAdminDemoAssignmentOptions();
      const serverOptions = {
        campaigns: data.campaigns || [],
        maps: data.maps || [],
        threads: data.threads || []
      };
      const nextOptions = mergeAdminDemoOptions(serverOptions, localAdminDemoOptions);
      setAdminDemoOptions(serverOptions);
      setAdminDemoDraft(buildDemoAssignmentDraft(data.demoAssignment, nextOptions));
      setDemoAssignment(data.demoAssignment);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function loadDemoPage() {
    const assignment = demoAssignment || {};
    try {
      if (assignment.mapId) {
        const map = await loadMapById(assignment.mapId);
        if (assignment.campaignId && assignment.threadId) {
          setCenterTab('forums');
          const threadData = await getForumThread(assignment.campaignId, assignment.threadId);
          setSelectedForumThread(threadData.thread);
          setForumReplyDraft('');
        }
        return map;
      }
      return await loadMap('demo', 'map1');
    } catch (err) {
      showError(err);
      return null;
    }
  }

  async function loadMapById(mapId) {
    try {
      const data = await getMapById(mapId);
      setActiveMap(data.map);
      setMessage(`Loaded ${data.map.mapName}`);
      setError('');
      return data.map;
    } catch (err) {
      showError(err);
      return null;
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
      if (dashboardModal?.type === 'cast' && Number(dashboardModal.campaignId) === Number(campaignId)) {
        await refreshCampaignCast(campaignId);
      }
    } catch (err) {
      showError(err);
    }
  }

  async function handleSaveCampaignRecruitment(campaign) {
    const draft = campaignRecruitmentDraft[campaign.id] || campaign;
    try {
      const data = await updateCampaignRecruitment(campaign.id, {
        gameDescription: draft.gameDescription || '',
        recruitmentInfo: draft.recruitmentInfo || '',
        maxPlayers: parseMaxPlayers(draft.maxPlayers),
        recruitmentListed: Boolean(draft.recruitmentListed),
        allowLurkers: Boolean(draft.allowLurkers)
      });
      setCampaigns((current) => current.map((item) => (
        Number(item.id) === Number(campaign.id) ? data.campaign : item
      )));
      setCampaignRecruitmentDraft((current) => {
        const next = { ...current };
        delete next[campaign.id];
        return next;
      });
      setMessage('Recruitment settings saved');
      setError('');
      if (isGamesListRoute) await refreshRecruitingCampaigns();
    } catch (err) {
      showError(err);
    }
  }

  async function handleJoinCampaignAsLurker(campaign) {
    if (!authUser) {
      window.location.href = '/auth?mode=login';
      return;
    }
    try {
      const data = await joinCampaignAsLurker(campaign.id);
      setCampaigns((current) => {
        const exists = current.some((item) => Number(item.id) === Number(data.campaign.id));
        return exists
          ? current.map((item) => (Number(item.id) === Number(data.campaign.id) ? data.campaign : item))
          : [data.campaign, ...current];
      });
      setMessage(`Joined ${data.campaign.name} as a lurker`);
      setError('');
      await refreshRecruitingCampaigns();
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

  async function openDashboardModal(type, campaign) {
    setDashboardModal({ type, campaignId: campaign.id });
    if (type === 'recruitment') {
      setCampaignRecruitmentDraft((current) => ({
        ...current,
        [campaign.id]: {
          gameDescription: campaign.gameDescription || '',
          recruitmentInfo: campaign.recruitmentInfo || '',
          maxPlayers: campaign.maxPlayers ?? '',
          recruitmentListed: Boolean(campaign.recruitmentListed),
          allowLurkers: Boolean(campaign.allowLurkers)
        }
      }));
    }
    if (type === 'preview' || type === 'permissions') {
      await Promise.all([
        refreshCampaignForumThreads(campaign.id),
        refreshCampaignPostIdentities(campaign.id)
      ]);
    }
    if (type === 'cast' || type === 'characters' || type === 'add-character') {
      await refreshCampaignCast(campaign.id);
    }
  }

  async function refreshCampaignCast(campaignId) {
    try {
      const data = await listCampaignCast(campaignId);
      setCampaignCast((current) => ({ ...current, [campaignId]: data.cast }));
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateCampaignCast(campaign) {
    const key = getCastDraftKey(campaign.id, 'new');
    const draft = campaignCastDraft[key] || {};
    const name = String(draft.name || '').trim();
    if (!name) return false;
    try {
      if (draft.portraitUrl) await validatePortraitSource(draft.portraitUrl);
      const data = await createCampaignCast(campaign.id, {
        castType: draft.castType || 'npc',
        name,
        portraitUrl: draft.portraitUrl || '',
        publicDescription: draft.publicDescription || '',
        gmNotes: draft.gmNotes || '',
        combatStatsPublic: draft.combatStatsPublic || '',
        combatStatsGm: draft.combatStatsGm || '',
        statusEffectsPublic: draft.statusEffectsPublic || '',
        statusEffectsGm: draft.statusEffectsGm || '',
        currentHealth: draft.currentHealth || '',
        maxHealth: draft.maxHealth || '',
        visibleToPlayers: draft.visibleToPlayers !== false
      });
      setCampaignCast((current) => ({ ...current, [campaign.id]: data.cast }));
      setPortraitRefreshKey(Date.now());
      await refreshCampaignPostIdentities(campaign.id);
      setCampaignCastDraft((current) => ({
        ...current,
        [key]: { castType: 'npc', visibleToPlayers: true }
      }));
      setMessage(`Added ${name} to The Cast`);
      setError('');
      return true;
    } catch (err) {
      showError(err);
      return false;
    }
  }

  async function handleUpdateCampaignCast(campaignId, entry) {
    const draft = campaignCastDraft[getCastDraftKey(campaignId, entry.id)] || entry;
    const name = String(draft.name || '').trim();
    if (!name) return;
    try {
      if (draft.portraitUrl) await validatePortraitSource(draft.portraitUrl);
      const data = await updateCampaignCast(campaignId, entry.id, {
        name,
        portraitUrl: draft.portraitUrl || '',
        publicDescription: draft.publicDescription || '',
        gmNotes: draft.gmNotes || '',
        combatStatsPublic: draft.combatStatsPublic || '',
        combatStatsGm: draft.combatStatsGm || '',
        statusEffectsPublic: draft.statusEffectsPublic || '',
        statusEffectsGm: draft.statusEffectsGm || '',
        currentHealth: draft.currentHealth || '',
        maxHealth: draft.maxHealth || '',
        visibleToPlayers: draft.visibleToPlayers !== false
      });
      setCampaignCast((current) => ({ ...current, [campaignId]: data.cast }));
      setPortraitRefreshKey(Date.now());
      await refreshCampaignPostIdentities(campaignId);
      setMessage(`Updated ${name}`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleDeleteCampaignCast(campaignId, entry) {
    if (!window.confirm(`Remove ${entry.name} from The Cast?`)) return;
    try {
      const data = await deleteCampaignCast(campaignId, entry.id);
      setCampaignCast((current) => ({ ...current, [campaignId]: data.cast }));
      setPortraitRefreshKey(Date.now());
      await refreshCampaignPostIdentities(campaignId);
      setMessage(`Removed ${entry.name}`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  function updateCampaignCastDraft(campaignId, entryId, patch) {
    const key = getCastDraftKey(campaignId, entryId);
    setCampaignCastDraft((current) => ({
      ...current,
      [key]: { ...(current[key] || {}), ...patch }
    }));
  }

  async function handleCastPortraitFile(campaignId, entryId, file) {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImage(dataUrl);
      if (image.naturalWidth === image.naturalHeight && image.naturalWidth <= 512) {
        updateCampaignCastDraft(campaignId, entryId, { portraitUrl: dataUrl });
        return;
      }
      setPortraitCrop(createPortraitCropState(campaignId, entryId, dataUrl, image));
    } catch (err) {
      showError(err);
    }
  }

  async function handleApplyPortraitCrop() {
    if (!portraitCrop) return;
    try {
      const portraitUrl = await cropPortraitToDataUrl(portraitCrop);
      updateCampaignCastDraft(portraitCrop.campaignId, portraitCrop.entryId, { portraitUrl });
      setPortraitCrop(null);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function refreshCampaignForumThreads(campaignId) {
    try {
      const data = await listForumThreads(campaignId);
      setCampaignForumThreads((current) => ({ ...current, [campaignId]: data.threads }));
      if (data.campaign) {
        setCampaigns((current) => {
          const exists = current.some((campaign) => Number(campaign.id) === Number(data.campaign.id));
          return exists
            ? current.map((campaign) => (Number(campaign.id) === Number(data.campaign.id) ? data.campaign : campaign))
            : [data.campaign, ...current];
        });
      }
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function refreshCampaignPostIdentities(campaignId) {
    try {
      const data = await listForumPostIdentities(campaignId);
      setCampaignPostIdentities((current) => ({ ...current, [campaignId]: data.identities }));
    } catch (err) {
      showError(err);
    }
  }

  async function refreshOwnershipTransferInvite() {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!token) {
      setOwnershipTransferInvite(null);
      showError(new Error('Ownership transfer token is missing.'));
      return;
    }
    try {
      const data = await getCampaignOwnershipTransfer(token);
      setOwnershipTransferInvite(data.invite);
      setError('');
    } catch (err) {
      setOwnershipTransferInvite(null);
      showError(err);
    }
  }

  async function handleCreateOwnershipTransfer(campaign) {
    const username = String(campaignOwnershipTransferDraft[campaign.id] || '').trim();
    if (!username) return;
    try {
      const data = await createCampaignOwnershipTransfer(campaign.id, username);
      setCampaignOwnershipTransferDraft((current) => ({ ...current, [campaign.id]: '' }));
      setMessage(data.message || 'Ownership transfer invitation sent.');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleRespondOwnershipTransfer(decision) {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!token) return;
    try {
      const data = await respondCampaignOwnershipTransfer(token, decision);
      setMessage(data.message);
      setError('');
      setOwnershipTransferInvite(null);
      await refreshCampaigns();
      await refreshCurrentUser();
    } catch (err) {
      showError(err);
    }
  }

  async function refreshPublicForumSections() {
    try {
      const data = await listPublicForumSections();
      setPublicForumSections(data.sections);
    } catch (err) {
      showError(err);
    }
  }

  async function refreshPublicForumThreads(sectionSlug) {
    try {
      const data = await listPublicForumThreads(sectionSlug);
      setPublicForumThreadsBySection((current) => ({ ...current, [sectionSlug]: data.threads }));
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function refreshAdminUsers() {
    try {
      const data = await listAdminUsers();
      setAdminUsers(data.users);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  function handleAdminDemoDraftChange(field, value) {
    setAdminDemoDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === 'campaignId') {
        next.mapId = '';
        next.threadId = '';
      }
      if (field === 'mapId') {
        const selectedThread = effectiveAdminDemoOptions.threads.find((thread) => String(thread.id) === String(next.threadId));
        if (!value || String(selectedThread?.mapId || '') !== String(value)) next.threadId = '';
      }
      return next;
    });
  }

  async function handleSaveDemoAssignment(event) {
    event.preventDefault();
    try {
      const payload = {
        campaignId: adminDemoDraft.campaignId ? Number(adminDemoDraft.campaignId) : null,
        mapId: adminDemoDraft.mapId ? Number(adminDemoDraft.mapId) : null,
        threadId: adminDemoDraft.threadId ? Number(adminDemoDraft.threadId) : null
      };
      const data = await updateDemoAssignment(payload);
      setDemoAssignment(data.demoAssignment);
      setAdminDemoDraft({
        campaignId: payload.campaignId ? String(payload.campaignId) : '',
        mapId: payload.mapId ? String(payload.mapId) : '',
        threadId: payload.threadId ? String(payload.threadId) : ''
      });
      setMessage('Demo link assignment saved');
      setError('');
      await refreshAdminDemoOptions();
    } catch (err) {
      showError(err);
    }
  }

  async function handleUpdateAdminUserRole(user, communityRole) {
    try {
      await updateAdminUserRole(user.userId, communityRole);
      setMessage(`${user.displayName || user.email} is now ${formatCommunityRole(communityRole)}.`);
      setError('');
      await refreshAdminUsers();
      if (authUser?.id === user.userId) await refreshCurrentUser();
    } catch (err) {
      showError(err);
    }
  }

  function handleOpenPublicForumThreadModal(section) {
    if (!authUser) {
      showError(new Error('Sign in to create a public forum thread.'));
      return;
    }
    setPublicForumNewThreadSection(section);
    setPublicForumThreadDraft({ title: '', body: '' });
    setError('');
  }

  async function handleSelectPublicForumThread(threadId) {
    try {
      const data = await getPublicForumThread(threadId);
      setPublicForumThread(data.thread);
      setPublicForumReplyDraft('');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreatePublicForumThread(event) {
    event.preventDefault();
    if (!authUser) {
      showError(new Error('Sign in to create a public forum thread.'));
      return;
    }
    if (!publicForumNewThreadSection) return;
    const title = publicForumThreadDraft.title.trim();
    const body = publicForumThreadDraft.body.trim();
    if (!title || !body) return;

    try {
      const data = await createPublicForumThread(publicForumNewThreadSection.slug, { title, body });
      setPublicForumThreadDraft({ title: '', body: '' });
      setPublicForumNewThreadSection(null);
      setMessage(`Created public thread ${title}`);
      setError('');
      await refreshPublicForumThreads(publicForumNewThreadSection.slug);
      setPublicForumThread(data.thread);
      window.history.pushState({}, '', `/forums/${encodeURIComponent(publicForumNewThreadSection.slug)}/threads/${data.thread.id}`);
      await refreshCurrentUser();
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreatePublicForumPost(event) {
    event.preventDefault();
    if (!authUser) {
      showError(new Error('Sign in to reply to public forum threads.'));
      return;
    }
    const body = publicForumReplyDraft.trim();
    if (!publicForumThread?.id || !body) return;

    try {
      const data = await createPublicForumPost(publicForumThread.id, body);
      setPublicForumThread(data.thread);
      setPublicForumReplyDraft('');
      setMessage('Reply posted');
      setError('');
      if (data.thread?.sectionSlug) await refreshPublicForumThreads(data.thread.sectionSlug);
      await refreshCurrentUser();
    } catch (err) {
      showError(err);
    }
  }

  async function handleSaveEditedPublicForumPost(event, threadId) {
    event.preventDefault();
    if (!editingPost?.postId || !editingPost.body.trim()) return;
    try {
      const data = await updatePublicForumPost(threadId, editingPost.postId, editingPost.body);
      setPublicForumThread(data.thread);
      setEditingPost(null);
      setMessage('Post updated.');
      setError('');
      if (data.thread?.sectionSlug) await refreshPublicForumThreads(data.thread.sectionSlug);
    } catch (err) {
      showError(err);
    }
  }

  async function handleDeletePublicForumPost(threadId, postId) {
    if (!window.confirm('Delete this post text?')) return;
    try {
      const data = await deletePublicForumPost(threadId, postId);
      setPublicForumThread(data.thread);
      setEditingPost(null);
      setMessage('Post deleted.');
      setError('');
      if (data.thread?.sectionSlug) await refreshPublicForumThreads(data.thread.sectionSlug);
    } catch (err) {
      showError(err);
    }
  }

  async function handleTogglePublicForumSticky(thread) {
    try {
      const data = await setPublicForumThreadSticky(thread.id, !thread.sticky);
      setPublicForumThread(data.thread);
      setMessage(data.thread.sticky ? 'Thread marked sticky.' : 'Thread is no longer sticky.');
      setError('');
      if (data.thread?.sectionSlug) await refreshPublicForumThreads(data.thread.sectionSlug);
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreateCampaignForumThread(campaign) {
    const draft = campaignForumDraft[campaign.id] || {};
    const title = String(draft.title || '').trim();
    const body = String(draft.body || '').trim();
    const mapId = draft.mapId ? Number.parseInt(draft.mapId, 10) : null;
    const visibilityLevel = draft.visibilityLevel || 'campaign';
    if (!title || !body) return;

    try {
      await createForumThread(campaign.id, { title, body, mapId, visibilityLevel });
      setCampaignForumDraft((current) => ({ ...current, [campaign.id]: {} }));
      setMessage(`Created forum thread ${title}`);
      setError('');
      await refreshCampaignForumThreads(campaign.id);
      await refreshCurrentUser();
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

  async function handleSetForumThreadVisibility(campaign, threadId, visibilityLevel, context = 'forum') {
    if (!campaign?.id || !threadId || !visibilityLevel) return;
    try {
      const data = await setForumThreadVisibility(campaign.id, threadId, visibilityLevel);
      if (context === 'map' && selectedForumThread?.id === data.thread.id) {
        setSelectedForumThread(data.thread);
        await refreshMapForumThreads();
      } else if (forumPageThread?.id === data.thread.id) {
        setForumPageThread(data.thread);
      }
      await refreshCampaignForumThreads(campaign.id);
      setMessage(`Thread visibility set to ${formatForumThreadVisibility(data.thread.visibilityLevel)}`);
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleAssignMapForumThread(campaign, map, threadIdValue) {
    const nextThreadId = threadIdValue ? Number.parseInt(threadIdValue, 10) : null;
    const threads = campaignForumThreads[campaign.id] || [];
    const currentlyAssigned = threads.filter((thread) => Number(thread.mapId) === Number(map.id));
    try {
      await Promise.all(currentlyAssigned.map((thread) => assignForumThreadMap(campaign.id, thread.id, null)));
      if (nextThreadId) {
        await assignForumThreadMap(campaign.id, nextThreadId, map.id);
      }
      setMessage(nextThreadId ? `Connected ${map.name} to a forum thread` : `Removed forum thread from ${map.name}`);
      setError('');
      await refreshCampaignForumThreads(campaign.id);
      if (activeMap?.id === map.id && activeMap?.campaignId === campaign.id && centerTab === 'forums') {
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
      } else if (!selectedForumThread && data.threads[0]) {
        const threadData = await getForumThread(activeMap.campaignId, data.threads[0].id);
        setSelectedForumThread(threadData.thread);
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
        mapId: activeMap.id,
        visibilityLevel: 'campaign'
      });
      setMapForumDraft({ title: '', body: '' });
      setSelectedForumThread(data.thread);
      setMessage(`Created forum thread ${title}`);
      setError('');
      await refreshMapForumThreads();
      await refreshCurrentUser();
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
      await refreshCurrentUser();
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
      await refreshCurrentUser();
    } catch (err) {
      showError(err);
    }
  }

  function handleStartEditPost(post) {
    setEditingPost({ postId: post.id, body: post.body || '' });
  }

  async function handleSaveEditedPost(event, campaignId, threadId, context = 'forum') {
    event.preventDefault();
    if (!editingPost?.postId || !editingPost.body.trim()) return;
    try {
      const data = await updateForumPost(campaignId, threadId, editingPost.postId, editingPost.body);
      if (context === 'map') {
        setSelectedForumThread(data.thread);
        await refreshMapForumThreads();
      } else {
        setForumPageThread(data.thread);
        await refreshCampaignForumThreads(campaignId);
      }
      setEditingPost(null);
      setMessage('Post updated. Existing dice rolls were preserved.');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleDeleteForumPost(campaignId, threadId, postId, context = 'forum') {
    if (!window.confirm('Delete this post text? Any dice rolls attached to it will remain visible.')) return;
    try {
      const data = await deleteForumPost(campaignId, threadId, postId);
      if (context === 'map') {
        setSelectedForumThread(data.thread);
        await refreshMapForumThreads();
      } else {
        setForumPageThread(data.thread);
        await refreshCampaignForumThreads(campaignId);
      }
      setEditingPost(null);
      setMessage('Post deleted. Dice rolls remain in the thread.');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleMarkForumThreadRead(campaignId, threadId, context = 'forum') {
    try {
      const data = await markForumThreadRead(campaignId, threadId);
      if (context === 'map') {
        setSelectedForumThread(data.thread);
        await refreshMapForumThreads();
      } else {
        setForumPageThread(data.thread);
        await refreshCampaignForumThreads(campaignId);
      }
      await refreshCampaigns();
      setMessage('Thread marked read');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleToggleForumThreadSubscription(campaignId, thread, context = 'forum') {
    try {
      const data = thread.subscribed
        ? await unsubscribeForumThread(campaignId, thread.id)
        : await subscribeForumThread(campaignId, thread.id);
      if (context === 'map') {
        setSelectedForumThread(data.thread);
        await refreshMapForumThreads();
      } else {
        setForumPageThread(data.thread);
        await refreshCampaignForumThreads(campaignId);
      }
      setMessage(thread.subscribed ? 'Thread subscription removed' : 'Thread subscription added');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleSendForumThreadTestNotification(campaignId, threadId) {
    try {
      const data = await sendForumThreadTestNotification(campaignId, threadId);
      setTestNotificationInfo(data.email);
      setMessage(data.email?.sent ? 'Test notification sent to your account email' : 'Test notification attempt failed');
      setError('');
    } catch (err) {
      showError(err);
    }
  }

  async function handleSetMapVisibility(map, visibilityLevel) {
    if (!map?.id || !visibilityLevel) return;
    try {
      const data = await setMapVisibility(map.id, visibilityLevel);
      if (activeMap?.id === data.map.id) {
        activeMapRef.current = data.map;
        setActiveMap(data.map);
      }
      await refreshCampaigns();
      setMessage(`Map visibility set to ${formatMapVisibility(data.map.visibilityLevel)}`);
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
      return data.map;
    } catch (err) {
      showError(err);
      return null;
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

  async function handleAddCastEntityToMap(entry) {
    const maxHp = Math.max(1, parseHealthNumber(entry.maxHealth, 10));
    const hp = Math.min(maxHp, parseHealthNumber(entry.currentHealth, maxHp));
    await handleAddEntity({
      type: 'mob',
      name: entry.name,
      image: entry.portraitUrl || '',
      hp,
      maxHp,
      combatStatsPublic: entry.combatStatsPublic || '',
      combatStatsGm: entry.combatStatsGm || '',
      statusEffectsPublic: entry.statusEffectsPublic || '',
      statusEffectsGm: entry.statusEffectsGm || '',
      currentHealthText: entry.currentHealth || String(hp),
      maxHealthText: entry.maxHealth || String(maxHp),
      source: {
        type: 'campaign-cast',
        castId: entry.id,
        castType: entry.castType
      }
    });
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
      .catch(() => { })
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

  const accountModals = authUser ? (
    <>
      {accountModalOpen && (
        <AccountModal
          user={authUser}
          draft={accountDraft}
          onDraftChange={setAccountDraft}
          onPortraitFile={handleAccountPortraitFile}
          onSubmit={handleSaveAccountProfile}
          onCancel={() => setAccountModalOpen(false)}
        />
      )}
      {accountPortraitCrop && (
        <PortraitCropModal
          crop={accountPortraitCrop}
          onChange={setAccountPortraitCrop}
          onCancel={() => setAccountPortraitCrop(null)}
          onApply={handleApplyAccountPortraitCrop}
        />
      )}
    </>
  ) : null;

  if (isSplashRoute) {
    return (
      <>
        <SplashPage authUser={authUser} onOpenAccount={handleOpenAccountModal} onLogout={handleLogout} />
        {accountModals}
      </>
    );
  }

  if (isContactRoute) return null;

  if (isPublicForumsRoute) {
    return (
      <>
        <PublicForumsPage
          authUser={authUser}
          sections={publicForumSections}
          threadsBySection={publicForumThreadsBySection}
          sectionSlug={publicForumSectionSlug}
          threadId={publicForumThreadId}
          selectedThread={publicForumThread}
          newThreadSection={publicForumNewThreadSection}
          threadDraft={publicForumThreadDraft}
          replyDraft={publicForumReplyDraft}
          message={message}
          error={error}
          portraitRefreshKey={portraitRefreshKey}
          onOpenAccount={handleOpenAccountModal}
          onLogout={handleLogout}
          onOpenNewThread={handleOpenPublicForumThreadModal}
          onCloseNewThread={() => setPublicForumNewThreadSection(null)}
          onThreadDraftChange={setPublicForumThreadDraft}
          onReplyDraftChange={setPublicForumReplyDraft}
          onCreateThread={handleCreatePublicForumThread}
          onCreatePost={handleCreatePublicForumPost}
          editingPost={editingPost}
          onStartEditPost={handleStartEditPost}
          onEditDraftChange={(body) => setEditingPost((current) => ({ ...current, body }))}
          onCancelEditPost={() => setEditingPost(null)}
          onSaveEditPost={handleSaveEditedPublicForumPost}
          onDeletePost={handleDeletePublicForumPost}
          onToggleSticky={handleTogglePublicForumSticky}
        />
        {accountModals}
      </>
    );
  }

  if (isGamesListRoute) {
    return (
      <>
        <GamesListPage
          authUser={authUser}
          campaigns={recruitingCampaigns}
          userCampaigns={campaigns}
          message={message}
          error={error}
          onOpenAccount={handleOpenAccountModal}
          onLogout={handleLogout}
          onRefresh={refreshRecruitingCampaigns}
          onJoinLurker={handleJoinCampaignAsLurker}
        />
        {accountModals}
      </>
    );
  }

  if (!authUser && !isDemoRoute) {
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

  if (isOwnershipTransferRoute) {
    return (
      <>
        <OwnershipTransferPage
          authUser={authUser}
          invite={ownershipTransferInvite}
          message={message}
          error={error}
          onOpenAccount={handleOpenAccountModal}
          onLogout={handleLogout}
          onRefresh={refreshOwnershipTransferInvite}
          onRespond={handleRespondOwnershipTransfer}
        />
        {accountModals}
      </>
    );
  }

  if (isAdminRoute) {
    return (
      <>
        <AdminPage
          authUser={authUser}
          users={adminUsers}
          demoAssignment={demoAssignment}
          demoOptions={effectiveAdminDemoOptions}
          demoDraft={adminDemoDraft}
          message={message}
          error={error}
          onOpenAccount={handleOpenAccountModal}
          onLogout={handleLogout}
          onDemoDraftChange={handleAdminDemoDraftChange}
          onSaveDemoAssignment={handleSaveDemoAssignment}
          onUpdateRole={handleUpdateAdminUserRole}
        />
        {accountModals}
      </>
    );
  }

  if (forumRouteMatch) {
    const campaignId = Number.parseInt(forumRouteMatch[1], 10);
    const campaign = campaigns.find((item) => Number(item.id) === campaignId);
    return (
      <>
        <ForumPage
          campaign={campaign}
          threads={campaignForumThreads[campaignId] || []}
          selectedThread={forumPageThread}
          postIdentities={campaignPostIdentities[campaignId] || []}
          threadDraft={campaignForumDraft[campaignId] || {}}
          replyDraft={forumPageReplyDraft}
          message={message}
          error={error}
          authUser={authUser}
          portraitRefreshKey={portraitRefreshKey}
          onOpenAccount={handleOpenAccountModal}
          onLogout={handleLogout}
          onRefresh={() => refreshCampaignForumThreads(campaignId)}
          onSelectThread={(threadId) => handleSelectCampaignForumThread(campaignId, threadId)}
          onThreadDraftChange={(draft) => setCampaignForumDraft((current) => ({
            ...current,
            [campaignId]: typeof draft === 'function' ? draft(current[campaignId] || {}) : draft
          }))}
          onCreateThread={() => campaign && handleCreateCampaignForumThread(campaign)}
          onAssignThread={(threadId, mapId) => campaign && handleAssignCampaignForumThread(campaign, threadId, mapId)}
          onSetThreadVisibility={(threadId, visibilityLevel) => campaign && handleSetForumThreadVisibility(campaign, threadId, visibilityLevel)}
          onReplyDraftChange={setForumPageReplyDraft}
          onCreatePost={(event) => handleCreateCampaignForumPost(event, campaignId)}
          editingPost={editingPost}
          onStartEditPost={handleStartEditPost}
          onEditDraftChange={(body) => setEditingPost((current) => ({ ...current, body }))}
          onCancelEditPost={() => setEditingPost(null)}
          onSaveEditPost={(event, threadId) => handleSaveEditedPost(event, campaignId, threadId, 'forum')}
          onDeletePost={(threadId, postId) => handleDeleteForumPost(campaignId, threadId, postId, 'forum')}
          onMarkThreadRead={(threadId) => handleMarkForumThreadRead(campaignId, threadId, 'forum')}
          onToggleSubscription={(thread) => handleToggleForumThreadSubscription(campaignId, thread, 'forum')}
          onSendTestNotification={(threadId) => handleSendForumThreadTestNotification(campaignId, threadId)}
        />
        {testNotificationInfo && (
          <TestNotificationModal info={testNotificationInfo} onClose={() => setTestNotificationInfo(null)} />
        )}
        {accountModals}
      </>
    );
  }

  if (!mapRouteMatch && !isDemoRoute) {
    const activeDashboardCampaign = dashboardModal
      ? campaigns.find((campaign) => Number(campaign.id) === Number(dashboardModal.campaignId))
      : null;
    const ownedCampaigns = campaigns.filter((campaign) => campaign.role === 'owner');
    const joinedCampaigns = campaigns.filter((campaign) => campaign.role !== 'owner');

    return (
      <main className="dashboard-page">
        <SiteHeader
          authUser={authUser}
          title="Campaign Dashboard"
          subtitle="Manage you campaigns and characters"
          onOpenAccount={handleOpenAccountModal}
          onLogout={handleLogout}
        />

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

          <CampaignDashboardSection
            title="Campaigns I Run"
            campaigns={ownedCampaigns}
            emptyText="Create a campaign to get started."
            onOpenDashboardModal={openDashboardModal}
          />

          <CampaignDashboardSection
            title="Campaigns I Play In"
            campaigns={joinedCampaigns}
            emptyText="Campaigns you join will appear here."
            onOpenDashboardModal={openDashboardModal}
          />
        </section>

        {activeDashboardCampaign && (
          <DashboardCampaignModal
            type={dashboardModal.type}
            campaign={activeDashboardCampaign}
            cast={campaignCast[activeDashboardCampaign.id] || []}
            castDrafts={campaignCastDraft}
            memberDraft={campaignMemberDraft[activeDashboardCampaign.id] || ''}
            recruitmentDraft={campaignRecruitmentDraft[activeDashboardCampaign.id] || activeDashboardCampaign}
            ownershipTransferDraft={campaignOwnershipTransferDraft[activeDashboardCampaign.id] || ''}
            mapDraft={campaignMapDraft[activeDashboardCampaign.id] || {}}
            forumThreads={campaignForumThreads[activeDashboardCampaign.id] || []}
            forumDraft={campaignForumDraft[activeDashboardCampaign.id] || {}}
            postIdentities={campaignPostIdentities[activeDashboardCampaign.id] || []}
            portraitRefreshKey={portraitRefreshKey}
            onClose={() => setDashboardModal(null)}
            onMemberDraftChange={(value) => setCampaignMemberDraft((current) => ({ ...current, [activeDashboardCampaign.id]: value }))}
            onInviteMember={() => handleInviteCampaignMember(activeDashboardCampaign.id)}
            onRecruitmentDraftChange={(patch) => setCampaignRecruitmentDraft((current) => ({
              ...current,
              [activeDashboardCampaign.id]: { ...(current[activeDashboardCampaign.id] || activeDashboardCampaign), ...patch }
            }))}
            onSaveRecruitment={() => handleSaveCampaignRecruitment(activeDashboardCampaign)}
            onOwnershipTransferDraftChange={(value) => setCampaignOwnershipTransferDraft((current) => ({ ...current, [activeDashboardCampaign.id]: value }))}
            onCreateOwnershipTransfer={() => handleCreateOwnershipTransfer(activeDashboardCampaign)}
            onMapDraftChange={(patch) => setCampaignMapDraft((current) => ({
              ...current,
              [activeDashboardCampaign.id]: { ...(current[activeDashboardCampaign.id] || {}), ...patch }
            }))}
            onCreateMap={() => handleCreateCampaignMap(activeDashboardCampaign.id)}
            onSetMapVisibility={(map, visibilityLevel) => handleSetMapVisibility(map, visibilityLevel)}
            onAssignMapThread={(map, threadId) => handleAssignMapForumThread(activeDashboardCampaign, map, threadId)}
            onForumDraftChange={(patch) => setCampaignForumDraft((current) => ({
              ...current,
              [activeDashboardCampaign.id]: { ...(current[activeDashboardCampaign.id] || {}), ...patch }
            }))}
            onCreateForumThread={() => handleCreateCampaignForumThread(activeDashboardCampaign)}
            onAssignThread={(threadId, mapId) => handleAssignCampaignForumThread(activeDashboardCampaign, threadId, mapId)}
            onSetThreadVisibility={(threadId, visibilityLevel) => handleSetForumThreadVisibility(activeDashboardCampaign, threadId, visibilityLevel)}
            onCastDraftChange={updateCampaignCastDraft}
            onCastPortraitFile={handleCastPortraitFile}
            onCreateCast={() => handleCreateCampaignCast(activeDashboardCampaign)}
            onSaveCast={(entry) => handleUpdateCampaignCast(activeDashboardCampaign.id, entry)}
            onDeleteCast={(entry) => handleDeleteCampaignCast(activeDashboardCampaign.id, entry)}
          />
        )}

        {portraitCrop && (
          <PortraitCropModal
            crop={portraitCrop}
            onChange={setPortraitCrop}
            onCancel={() => setPortraitCrop(null)}
            onApply={handleApplyPortraitCrop}
          />
        )}
        {accountModals}

        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <a className="brand-link" href="/" aria-label="PBPHUD home">
            <BrandLockup title="PBPHud Map Editor" subtitle={activeMap?.campaign?.name || 'Campaign map and forum workspace'} />
          </a>
        </div>
        <div className="topbar-actions">
          {authUser ? (
            <div className="account-panel">
              <span>Signed in as</span>
              <strong>{authUser.displayName}</strong>
              <small>{authUser.email}</small>
              <button type="button" onClick={handleOpenAccountModal}>Account</button>
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
          panels.right ? '' : 'right-panel-collapsed'
        ].filter(Boolean).join(' ')}
      >
        <section className={`map-panel ${centerTab === 'map' && !panels.top ? 'top-panel-collapsed' : ''}`}>
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
              Posts
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
                    <span>Map width</span>
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
                    <span>Map height</span>
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
                onSelectEntity={(id) => {
                  setSelectedEntityId(id);
                  setRightTab('entities');
                }}
              />
            </>
          ) : (
            <MapForumPanel
              activeMap={activeMap}
              threads={mapForumThreads}
              selectedThread={selectedForumThread}
              postIdentities={campaignPostIdentities[activeMap?.campaignId] || []}
              replyDraft={forumReplyDraft}
              portraitRefreshKey={portraitRefreshKey}
              onReplyDraftChange={setForumReplyDraft}
              onCreatePost={handleCreateMapForumPost}
              viewerUserId={viewerUserId}
              editingPost={editingPost}
              onStartEditPost={handleStartEditPost}
              onEditDraftChange={(body) => setEditingPost((current) => ({ ...current, body }))}
              onCancelEditPost={() => setEditingPost(null)}
              onSaveEditPost={(event, threadId) => handleSaveEditedPost(event, activeMap.campaignId, threadId, 'map')}
              onDeletePost={(threadId, postId) => handleDeleteForumPost(activeMap.campaignId, threadId, postId, 'map')}
              onMarkThreadRead={(threadId) => handleMarkForumThreadRead(activeMap.campaignId, threadId, 'map')}
              onToggleSubscription={(thread) => handleToggleForumThreadSubscription(activeMap.campaignId, thread, 'map')}
              onSendTestNotification={(threadId) => handleSendForumThreadTestNotification(activeMap.campaignId, threadId)}
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
                campaignCast={activeMap?.campaignId ? campaignCast[activeMap.campaignId] || [] : []}
                canManageEntities={permissions.canManageEntities}
                canCreateEntities={permissions.canCreateEntities}
                canEditEntity={(entity) => canControlEntity(entity, entities, viewerUserId, permissions)}
                onAdd={handleAddEntity}
                onAddCastMember={handleAddCastEntityToMap}
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

      {testNotificationInfo && (
        <TestNotificationModal info={testNotificationInfo} onClose={() => setTestNotificationInfo(null)} />
      )}
      {accountModals}
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

function parseMaxPlayers(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(999, Math.trunc(number)));
}

function formatMapVisibility(visibilityLevel) {
  return MAP_VISIBILITY_LEVELS.find((level) => level.value === visibilityLevel)?.label || 'Hidden';
}

function formatForumThreadVisibility(visibilityLevel) {
  return FORUM_THREAD_VISIBILITY_LEVELS.find((level) => level.value === visibilityLevel)?.label || 'Campaign';
}

function canPostInCampaignThread(thread, campaign, authUser) {
  if (!thread || !authUser) return false;
  if (thread.permissions?.canPost) return true;
  const visibilityLevel = thread.visibilityLevel || 'campaign';
  if (campaign?.role === 'lurker') return false;
  if (visibilityLevel === 'demo') return true;
  if (campaign?.role === 'owner') return true;
  return campaign?.role === 'member' && (visibilityLevel === 'public' || visibilityLevel === 'campaign');
}

function getCastDraftKey(campaignId, entryId) {
  return `${campaignId}:${entryId}`;
}

function buildAccountDraft(user) {
  return {
    displayName: user?.displayName || '',
    profileAbout: user?.profileAbout || '',
    profilePronouns: user?.profilePronouns || '',
    profileTimezone: user?.profileTimezone || '',
    profileImageUrl: user?.profileImageUrl || '',
    useGravatar: Boolean(user?.useGravatar),
    autoSubscribeForumThreads: Boolean(user?.autoSubscribeForumThreads)
  };
}

function getInitials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'PB';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

function readFileAsDataUrl(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Portrait upload must be an image');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read portrait image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Portrait image could not be loaded'));
    image.src = src;
  });
}

function createPortraitCropState(campaignId, entryId, src, image) {
  const scale = 512 / Math.min(image.naturalWidth, image.naturalHeight);
  const scaledWidth = Math.round(image.naturalWidth * scale);
  const scaledHeight = Math.round(image.naturalHeight * scale);
  const maxOffsetX = Math.max(0, scaledWidth - 512);
  const maxOffsetY = Math.max(0, scaledHeight - 512);
  return {
    campaignId,
    entryId,
    src,
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
    scale,
    scaledWidth,
    scaledHeight,
    offsetX: Math.round(maxOffsetX / 2),
    offsetY: Math.round(maxOffsetY / 2),
    maxOffsetX,
    maxOffsetY
  };
}

async function cropPortraitToDataUrl(crop) {
  const image = await loadImage(crop.src);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fffaf0';
  context.fillRect(0, 0, 512, 512);
  context.drawImage(
    image,
    -crop.offsetX,
    -crop.offsetY,
    crop.scaledWidth,
    crop.scaledHeight
  );
  return canvas.toDataURL('image/png');
}

function validatePortraitSource(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth !== image.naturalHeight) {
        reject(new Error('Portrait must be square'));
        return;
      }
      if (image.naturalWidth > 512 || image.naturalHeight > 512) {
        reject(new Error('Portrait must be 512x512 or smaller'));
        return;
      }
      resolve();
    };
    image.onerror = () => reject(new Error('Portrait image could not be loaded for validation'));
    image.src = src;
  });
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

function scrollThreadToUnreadOrBottom(thread) {
  if (!thread?.posts?.length) return;
  window.requestAnimationFrame(() => {
    const targetPostId = thread.firstUnreadPostId || thread.posts.at(-1)?.id;
    const target = document.getElementById(`forum-post-${targetPostId}`);
    if (target) {
      target.scrollIntoView({ block: thread.firstUnreadPostId ? 'center' : 'end' });
    }
  });
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

function parseHealthNumber(value, fallback) {
  const match = String(value || '').match(/\d+/);
  const number = match ? Number(match[0]) : Number(fallback);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
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

function SplashPage({ authUser, onOpenAccount, onLogout }) {
  return (
    <main className="splash-page">
      <SiteHeader authUser={authUser} onOpenAccount={onOpenAccount} onLogout={onLogout} />

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

function OwnershipTransferPage({
  authUser,
  invite,
  message,
  error,
  onOpenAccount,
  onLogout,
  onRefresh,
  onRespond
}) {
  return (
    <main className="dashboard-page ownership-transfer-page">
      <SiteHeader
        authUser={authUser}
        title="Campaign Ownership Transfer"
        subtitle={invite ? invite.campaignName : 'Invitation review'}
        onOpenAccount={onOpenAccount}
        onLogout={onLogout}
        actions={<button type="button" onClick={onRefresh}>Refresh</button>}
      />
      <section className="dashboard-layout">
        <section className="dashboard-create ownership-transfer-card">
          {invite ? (
            <>
              <strong>{invite.campaignName}</strong>
              <p>
                {invite.currentOwnerDisplayName} invited you to become the owner of this campaign.
                This invitation expires {formatDateTime(invite.expiresAt)}.
              </p>
              <div className="button-row">
                <button type="button" onClick={() => onRespond('accept')}>Accept ownership</button>
                <button type="button" onClick={() => onRespond('reject')}>Reject invitation</button>
              </div>
            </>
          ) : (
            <p>{error || 'Loading ownership transfer invitation...'}</p>
          )}
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}

function GamesListPage({
  authUser,
  campaigns,
  userCampaigns,
  message,
  error,
  onOpenAccount,
  onLogout,
  onRefresh,
  onJoinLurker
}) {
  const userCampaignIds = new Set(userCampaigns.map((campaign) => Number(campaign.id)));
  return (
    <main className="dashboard-page games-list-page">
      <SiteHeader
        authUser={authUser}
        title="Games List"
        subtitle="Campaigns looking for players and lurkers"
        onOpenAccount={onOpenAccount}
        onLogout={onLogout}
        actions={<button type="button" onClick={onRefresh}>Refresh</button>}
      />

      <section className="campaign-list games-list">
        <h2>Open Campaigns</h2>
        {(message || error) && <p className={`auth-message ${error ? 'error' : ''}`}>{error || message}</p>}
        {campaigns.map((campaign) => {
          const alreadyJoined = userCampaignIds.has(Number(campaign.id));
          return (
            <article className="campaign-card game-list-card" key={campaign.id}>
              <div className="campaign-card-header">
                <div>
                  <h3>{campaign.name}</h3>
                  <p>
                    {campaign.ownerDisplayName} · {formatPlayerCapacity(campaign.playerCount, campaign.maxPlayers)} · {formatCount(campaign.lurkerCount, 'lurker')}
                  </p>
                </div>
                <div className="button-row campaign-action-buttons smaller-button-text">
                  {campaign.allowLurkers && !alreadyJoined && (
                    <button type="button" onClick={() => onJoinLurker(campaign)}>
                      {authUser ? 'Join as Lurker' : 'Sign in to Lurk'}
                    </button>
                  )}
                  {alreadyJoined && <a className="button no-underline" href="/dashboard">Open Dashboard</a>}
                </div>
              </div>
              {campaign.gameDescription && <p className="game-list-text">{campaign.gameDescription}</p>}
              {campaign.recruitmentInfo && (
                <div className="game-list-recruitment">
                  <strong>Recruitment</strong>
                  <p>{campaign.recruitmentInfo}</p>
                </div>
              )}
              <div className="game-list-flags">
                {campaign.recruitmentListed && <span>Recruiting</span>}
                {campaign.allowLurkers && <span>Open to lurkers</span>}
                <span>{formatCount(campaign.mapCount, 'map')}</span>
              </div>
            </article>
          );
        })}
        {!campaigns.length && <p className="empty-state">No campaigns are recruiting yet.</p>}
      </section>

      <SiteFooter />
    </main>
  );
}

function DashboardCampaignModal({
  type,
  campaign,
  cast,
  castDrafts,
  memberDraft,
  recruitmentDraft,
  ownershipTransferDraft,
  mapDraft,
  forumThreads,
  forumDraft,
  postIdentities,
  portraitRefreshKey,
  onClose,
  onMemberDraftChange,
  onInviteMember,
  onRecruitmentDraftChange,
  onSaveRecruitment,
  onOwnershipTransferDraftChange,
  onCreateOwnershipTransfer,
  onMapDraftChange,
  onCreateMap,
  onSetMapVisibility,
  onAssignMapThread,
  onForumDraftChange,
  onCreateForumThread,
  onAssignThread,
  onSetThreadVisibility,
  onCastDraftChange,
  onCastPortraitFile,
  onCreateCast,
  onSaveCast,
  onDeleteCast
}) {
  const title = {
    members: 'Manage Members',
    maps: 'Maps',
    recruitment: 'Recruitment',
    cast: 'Manage the Cast',
    characters: 'List Characters',
    'add-character': 'Add Character',
    preview: 'Preview',
    permissions: 'Manage Permissions'
  }[type] || campaign.name;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal dashboard-action-modal" role="dialog" aria-modal="true" aria-label={`${title}: ${campaign.name}`}>
        <header>
          <div>
            <strong>{title}</strong>
            <small>{campaign.name}</small>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        {type === 'members' && (
          <div className="dashboard-modal-body">
            {campaign.role === 'owner' ? (
              <>
                <div className="inline-form">
                  <input
                    value={memberDraft}
                    onChange={(event) => onMemberDraftChange(event.target.value)}
                    placeholder="Invite user id"
                  />
                  <button type="button" onClick={onInviteMember}>Invite</button>
                </div>
                <small>Members: {campaign.members.length ? campaign.members.join(', ') : 'No invited players yet'}</small>
              </>
            ) : (
              <p>You are an invited player in this campaign.</p>
            )}
          </div>
        )}

        {type === 'maps' && (
          <div className="dashboard-modal-body dashboard-maps-body">
            {campaign.role === 'owner' && (
              <section className="dashboard-map-create">
                <h4>Add Map</h4>
                <div className="inline-form campaign-map-form">
                  <input
                    value={mapDraft.mapName || ''}
                    onChange={(event) => onMapDraftChange({ mapName: event.target.value })}
                    placeholder="New map name"
                  />
                  <label className="compact-field">
                    <span>Width</span>
                    <input
                      value={mapDraft.gridWidth || 40}
                      onChange={(event) => onMapDraftChange({ gridWidth: event.target.value })}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="compact-field">
                    <span>Height</span>
                    <input
                      value={mapDraft.gridHeight || 40}
                      onChange={(event) => onMapDraftChange({ gridHeight: event.target.value })}
                      inputMode="numeric"
                    />
                  </label>
                  <button type="button" onClick={onCreateMap}>Create map</button>
                </div>
              </section>
            )}
            <DashboardMapList
              campaign={campaign}
              forumThreads={forumThreads}
              onSetMapVisibility={onSetMapVisibility}
              onAssignMapThread={onAssignMapThread}
              showPermissions={false}
            />
          </div>
        )}

        {type === 'recruitment' && campaign.role === 'owner' && (
          <div className="dashboard-modal-body recruitment-modal-body">
            <label>
              <span>Game description</span>
              <textarea
                value={recruitmentDraft.gameDescription || ''}
                onChange={(event) => onRecruitmentDraftChange({ gameDescription: event.target.value })}
                placeholder="Describe the campaign premise, tone, system, schedule, and table style."
                rows={5}
              />
            </label>
            <label>
              <span>Recruitment info</span>
              <textarea
                value={recruitmentDraft.recruitmentInfo || ''}
                onChange={(event) => onRecruitmentDraftChange({ recruitmentInfo: event.target.value })}
                placeholder="Say what roles, characters, posting pace, or player expectations you are looking for."
                rows={5}
              />
            </label>
            <label>
              <span>Max # of players</span>
              <input
                type="number"
                min="1"
                max="999"
                inputMode="numeric"
                value={recruitmentDraft.maxPlayers ?? ''}
                onChange={(event) => onRecruitmentDraftChange({ maxPlayers: event.target.value })}
                placeholder="Open"
              />
            </label>
            <div className="recruitment-options">
              <label className="check-control">
                <input
                  type="checkbox"
                  checked={Boolean(recruitmentDraft.recruitmentListed)}
                  onChange={(event) => onRecruitmentDraftChange({ recruitmentListed: event.target.checked })}
                />
                List in Games List
              </label>
              <label className="check-control">
                <input
                  type="checkbox"
                  checked={Boolean(recruitmentDraft.allowLurkers)}
                  onChange={(event) => onRecruitmentDraftChange({ allowLurkers: event.target.checked })}
                />
                Allow people to join as lurkers
              </label>
            </div>
            <button type="button" onClick={onSaveRecruitment}>Save recruitment</button>
          </div>
        )}

        {(type === 'cast' || type === 'characters' || type === 'add-character') && (
          <CampaignCastPanel
            campaign={campaign}
            cast={cast}
            drafts={castDrafts}
            onDraftChange={onCastDraftChange}
            onPortraitFile={onCastPortraitFile}
            onCreate={onCreateCast}
            onSave={onSaveCast}
            onDelete={onDeleteCast}
          />
        )}

        {type === 'preview' && (
          <DashboardForumPreview
            campaign={campaign}
            forumThreads={forumThreads}
            forumDraft={forumDraft}
            postIdentities={postIdentities}
            portraitRefreshKey={portraitRefreshKey}
            onForumDraftChange={onForumDraftChange}
            onCreateForumThread={onCreateForumThread}
            onAssignThread={onAssignThread}
            onSetThreadVisibility={onSetThreadVisibility}
          />
        )}

        {type === 'permissions' && (
          <div className="dashboard-modal-body dashboard-permissions-body">
            <section>
              <h4>Map Permissions</h4>
              <DashboardMapList
                campaign={campaign}
                forumThreads={forumThreads}
                onSetMapVisibility={onSetMapVisibility}
                onAssignMapThread={onAssignMapThread}
                showPermissions
              />
            </section>
            <section>
              <h4>Thread Permissions</h4>
              <DashboardThreadPermissionList
                campaign={campaign}
                forumThreads={forumThreads}
                onAssignThread={onAssignThread}
                onSetThreadVisibility={onSetThreadVisibility}
              />
            </section>
            <section className="ownership-transfer-panel">
              <h4>Transfer Ownership</h4>
              <div className="inline-form">
                <input
                  value={ownershipTransferDraft}
                  onChange={(event) => onOwnershipTransferDraftChange(event.target.value)}
                  placeholder="New owner username"
                />
                <button type="button" onClick={onCreateOwnershipTransfer}>Send invite</button>
              </div>
              <small>The prospective owner receives an email and must accept before ownership changes.</small>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function DashboardMapList({ campaign, forumThreads, onSetMapVisibility, onAssignMapThread, showPermissions }) {
  return (
    <div className={`dashboard-map-list ${showPermissions ? 'permission-map-list' : ''}`}>
      {campaign.maps.map((map) => {
        const assignedThread = forumThreads.find((thread) => Number(thread.mapId) === Number(map.id));
        return (
          <div className="dashboard-map-row" key={map.id}>
            {showPermissions ? (
              <label className="map-thread-linker permission-map-name">
                <span>Map Name</span>
                <a href={`/maps/${map.id}`} target="_blank" rel="noopener noreferrer">
                  <span>{map.name}</span>
                </a>
              </label>
            ) : (
              <a href={`/maps/${map.id}`} target="_blank" rel="noopener noreferrer">
                <span>{map.name}</span>
                <small>{formatMapVisibility(map.visibilityLevel)}</small>
              </a>
            )}
            {campaign.role === 'owner' && showPermissions && (
              <>
                <label className="map-thread-linker">
                  <span>Visibility</span>
                  <select
                    value={map.visibilityLevel || (map.playerVisible ? 'campaign' : 'hidden')}
                    onChange={(event) => onSetMapVisibility(map, event.target.value)}
                  >
                    {MAP_VISIBILITY_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-thread-linker">
                  <span>Forum thread</span>
                  <select
                    value={assignedThread?.id || ''}
                    onChange={(event) => onAssignMapThread(map, event.target.value)}
                  >
                    <option value="">No linked thread</option>
                    {forumThreads.map((thread) => (
                      <option key={thread.id} value={thread.id}>
                        {thread.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        );
      })}
      {!campaign.maps.length && <p>No maps available.</p>}
    </div>
  );
}

function CampaignDashboardSection({ title, campaigns, emptyText, onOpenDashboardModal }) {
  return (
    <section className="campaign-list">
      <h2>{title}</h2>
      {campaigns.map((campaign) => (
        <article className="campaign-card" key={campaign.id}>
          <div className="campaign-card-header">
            <div>
              <h3>{campaign.name}</h3>
              <p>{formatCount(campaign.mapCount, 'map')} · {formatCount(campaign.unreadForumCount, 'unread forum post')}</p>
            </div>
            <div className="button-row campaign-action-buttons smaller-button-text">
              {campaign.role === 'owner' ? (
                <>
                  <button type="button" onClick={() => onOpenDashboardModal('members', campaign)}>Manage Members</button>
                  <button type="button" onClick={() => onOpenDashboardModal('maps', campaign)}>Maps</button>
                  <button type="button" onClick={() => onOpenDashboardModal('recruitment', campaign)}>Recruitment</button>
                  <a
                    className="button no-underline"
                    href={`/campaigns/${campaign.id}/forums`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Forums
                  </a>
                  <button type="button" onClick={() => onOpenDashboardModal('cast', campaign)}>Manage the Cast</button>
                  <button type="button" onClick={() => onOpenDashboardModal('permissions', campaign)}>Manage Permissions</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => onOpenDashboardModal('maps', campaign)}>Maps</button>
                  <a
                    className="button no-underline"
                    href={`/campaigns/${campaign.id}/forums`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Forums
                  </a>
                  {campaign.role !== 'lurker' && (
                    <>
                      <button type="button" onClick={() => onOpenDashboardModal('characters', campaign)}>List Characters</button>
                      <button type="button" onClick={() => onOpenDashboardModal('add-character', campaign)}>Add Character</button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </article>
      ))}
      {!campaigns.length && <p className="empty-state">{emptyText}</p>}
    </section>
  );
}

function DashboardThreadPermissionList({ campaign, forumThreads, onSetThreadVisibility }) {
  return (
    <div className="forum-thread-list compact permission-thread-list">
      {forumThreads.map((thread) => (
        <article className="forum-thread-row" key={thread.id}>
          <div>
            <span className="forum-thread-row-title"><strong>{thread.title}</strong></span>
            <small>
              {thread.postCount} posts · {thread.mapName ? `Map: ${thread.mapName}` : 'Campaign-wide'}
              {` · ${formatForumThreadVisibility(thread.visibilityLevel)}`}
            </small>
          </div>
          {campaign.role === 'owner' && (
            <select
              value={thread.visibilityLevel || 'campaign'}
              onChange={(event) => onSetThreadVisibility(thread.id, event.target.value)}
              aria-label={`Set ${thread.title} visibility`}
            >
              {FORUM_THREAD_VISIBILITY_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
          )}
        </article>
      ))}
      {!forumThreads.length && <p>No forum threads yet.</p>}
    </div>
  );
}

function DashboardForumPreview({
  campaign,
  forumThreads,
  forumDraft,
  postIdentities,
  portraitRefreshKey,
  onForumDraftChange,
  onCreateForumThread,
  onAssignThread,
  onSetThreadVisibility
}) {
  return (
    <section className="campaign-forum-panel">
      <div className="campaign-forum-header">
        <strong>Campaign Forums</strong>
        <small>Supports basic BBCode: [b], [i], [u], [quote], [code], [url]</small>
      </div>

      <DashboardThreadPermissionList
        campaign={campaign}
        forumThreads={forumThreads}
        onAssignThread={onAssignThread}
        onSetThreadVisibility={onSetThreadVisibility}
      />

      <div className="forum-compose">
        <input
          value={forumDraft.title || ''}
          onChange={(event) => onForumDraftChange({ title: event.target.value })}
          placeholder="Thread title"
        />
        <select
          value={forumDraft.mapId || ''}
          onChange={(event) => onForumDraftChange({ mapId: event.target.value })}
          aria-label="Assign new thread to map"
        >
          <option value="">Campaign-wide thread</option>
          {campaign.maps.map((map) => (
            <option key={map.id} value={map.id}>{map.name}</option>
          ))}
        </select>
        {campaign.role === 'owner' && (
          <select
            value={forumDraft.visibilityLevel || 'campaign'}
            onChange={(event) => onForumDraftChange({ visibilityLevel: event.target.value })}
            aria-label="New thread visibility"
          >
            {FORUM_THREAD_VISIBILITY_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>{level.label}</option>
            ))}
          </select>
        )}
        <BBCodeEditor
          value={forumDraft.body || ''}
          onChange={(value) => onForumDraftChange({ body: value })}
          postIdentities={postIdentities}
          portraitRefreshKey={portraitRefreshKey}
          placeholder="First post with BBCode"
        />
        <button type="button" onClick={onCreateForumThread}>Create thread</button>
      </div>
    </section>
  );
}

function CampaignCastPanel({
  campaign,
  cast,
  drafts,
  onDraftChange,
  onPortraitFile,
  onCreate,
  onSave,
  onDelete
}) {
  const [selectedCastId, setSelectedCastId] = useState('');
  const [activeCastTab, setActiveCastTab] = useState('player');
  const [createCastOpen, setCreateCastOpen] = useState(false);
  const [createCastMinimized, setCreateCastMinimized] = useState(false);
  const newKey = getCastDraftKey(campaign.id, 'new');
  const newDraft = drafts[newKey] || { castType: 'npc', visibleToPlayers: true };
  const visibleCast = useMemo(
    () => cast.filter((entry) => !(entry.castType === 'player' && entry.ownerUserId === campaign.ownerUserId)),
    [cast, campaign.ownerUserId]
  );
  const grouped = {
    player: visibleCast.filter((entry) => entry.castType === 'player'),
    npc: visibleCast.filter((entry) => entry.castType === 'npc'),
    monster: visibleCast.filter((entry) => entry.castType === 'monster')
  };
  const castTabs = [
    { id: 'player', label: 'Players', emptyText: 'No players yet.' },
    { id: 'npc', label: 'NPCs', emptyText: 'No NPCs yet.' },
    { id: 'monster', label: 'Monsters', emptyText: 'No monsters yet.' }
  ];
  const activeTab = castTabs.find((tab) => tab.id === activeCastTab) || castTabs[0];
  const activeEntries = grouped[activeTab.id] || [];
  const selectedEntry = visibleCast.find((entry) => String(entry.id) === String(selectedCastId));
  const selectedDraft = selectedEntry ? drafts[getCastDraftKey(campaign.id, selectedEntry.id)] || selectedEntry : null;

  useEffect(() => {
    if (selectedCastId && !visibleCast.some((entry) => String(entry.id) === String(selectedCastId))) {
      setSelectedCastId('');
    }
  }, [visibleCast, selectedCastId]);

  async function handleCreateCast() {
    const created = await onCreate();
    if (created) setCreateCastOpen(false);
  }

  return (
    <section className="campaign-cast-panel">
      <div className="campaign-forum-header">
        <strong>The Cast</strong>
        <small>Select a cast member to edit their details.</small>
      </div>

      <div className="cast-tabs" role="tablist" aria-label="Cast type">
        {castTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab.id === tab.id ? 'selected' : ''}
            onClick={() => setActiveCastTab(tab.id)}
            role="tab"
            aria-selected={activeTab.id === tab.id}
          >
            <span>{tab.label}</span>
            <small>{grouped[tab.id].length}</small>
          </button>
        ))}
      </div>

      <div className="cast-list compact-cast-list" role="tabpanel" aria-label={activeTab.label}>
        {activeEntries.map((entry) => (
          <CastEntryCard
            key={entry.id}
            entry={entry}
            draft={drafts[getCastDraftKey(campaign.id, entry.id)] || entry}
            selected={String(selectedCastId) === String(entry.id)}
            onSelect={setSelectedCastId}
          />
        ))}
        {!activeEntries.length && <p>{activeTab.emptyText}</p>}
      </div>

      {selectedEntry && (
        <CastEntryEditor
          campaign={campaign}
          entry={selectedEntry}
          draft={selectedDraft}
          onDraftChange={onDraftChange}
          onPortraitFile={onPortraitFile}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setSelectedCastId('')}
        />
      )}

      {campaign.role === 'owner' && (
        <div className="cast-panel-actions">
          <button
            type="button"
            onClick={() => {
              setCreateCastOpen(true);
              setCreateCastMinimized(false);
            }}
          >
            Add
          </button>
        </div>
      )}

      {createCastOpen && createCastMinimized && (
        <div className="cast-minimized-create">
          <span>Add NPC or monster</span>
          <div className="button-row">
            <button type="button" onClick={() => setCreateCastMinimized(false)}>Restore</button>
            <button type="button" onClick={() => setCreateCastOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {createCastOpen && !createCastMinimized && (
        <CastCreateModal
          campaign={campaign}
          draft={newDraft}
          onDraftChange={onDraftChange}
          onPortraitFile={onPortraitFile}
          onCreate={handleCreateCast}
          onMinimize={() => setCreateCastMinimized(true)}
          onClose={() => setCreateCastOpen(false)}
        />
      )}
    </section>
  );
}

function CastCreateModal({ campaign, draft, onDraftChange, onPortraitFile, onCreate, onMinimize, onClose }) {
  return (
    <div className="modal-backdrop nested-modal-backdrop" role="presentation">
      <section className="confirm-modal cast-create-modal" role="dialog" aria-modal="true" aria-label="Add cast member">
        <header>
          <div>
            <strong>Add NPC or monster</strong>
            <small>{campaign.name}</small>
          </div>
          <div className="button-row">
            <button type="button" onClick={onMinimize}>Minimize</button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </header>
        <div className="cast-create-card">
          <div className="inline-form">
            <select
              value={draft.castType || 'npc'}
              onChange={(event) => onDraftChange(campaign.id, 'new', { castType: event.target.value })}
            >
              <option value="npc">NPC</option>
              <option value="monster">Monster</option>
            </select>
            <input
              value={draft.name || ''}
              onChange={(event) => onDraftChange(campaign.id, 'new', { name: event.target.value })}
              placeholder="Name"
            />
            <label className="check-control">
              <input
                type="checkbox"
                checked={draft.visibleToPlayers !== false}
                onChange={(event) => onDraftChange(campaign.id, 'new', { visibleToPlayers: event.target.checked })}
              />
              Show to players
            </label>
          </div>
          <CastPortraitControls
            campaignId={campaign.id}
            entryId="new"
            portraitUrl={draft.portraitUrl || ''}
            onDraftChange={onDraftChange}
            onPortraitFile={onPortraitFile}
          />
          <CastCombatFields
            campaignId={campaign.id}
            entryId="new"
            draft={draft}
            onDraftChange={onDraftChange}
          />
          <textarea
            value={draft.publicDescription || ''}
            onChange={(event) => onDraftChange(campaign.id, 'new', { publicDescription: event.target.value })}
            placeholder="Description shown to players"
            rows={3}
          />
          <textarea
            value={draft.gmNotes || ''}
            onChange={(event) => onDraftChange(campaign.id, 'new', { gmNotes: event.target.value })}
            placeholder="GM notes"
            rows={3}
          />
          <div className="button-row">
            <button type="button" onClick={onCreate}>Add to The Cast</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CastEntryCard({ entry, draft, selected, onSelect }) {
  const label = entry.castType === 'player' ? 'Player' : entry.castType === 'npc' ? 'NPC' : 'Monster';
  const portraitFallback = String(draft.name || entry.name || '?').slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      className={`cast-card ${entry.visibleToPlayers ? '' : 'hidden-cast'} ${selected ? 'selected-cast' : ''}`}
      onClick={() => onSelect(entry.id)}
      aria-label={`Edit ${entry.name}`}
    >
      <div className="cast-card-header">
        <div className="cast-portrait">
          {draft.portraitUrl ? <img src={draft.portraitUrl} alt="" /> : <span>{portraitFallback}</span>}
        </div>
        <span>
          <strong>{entry.name}</strong>
          <small>{label}</small>
        </span>
      </div>
    </button>
  );
}

function CastEntryEditor({ campaign, entry, draft, onDraftChange, onPortraitFile, onSave, onDelete, onClose }) {
  const label = entry.castType === 'player' ? 'Player' : entry.castType === 'npc' ? 'NPC' : 'Monster';
  return (
    <div className="modal-backdrop nested-modal-backdrop" role="presentation">
      <section className="confirm-modal cast-entry-modal" role="dialog" aria-modal="true" aria-label={`Edit ${entry.name}`}>
        <header>
          <div className="cast-editor-title">
            <strong>{entry.name}</strong>
            <small>{label}</small>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <section className="cast-editor-card">
          {entry.canEdit ? (
            <div className="cast-edit-form">
              <input
                value={draft.name || ''}
                onChange={(event) => onDraftChange(campaign.id, entry.id, { name: event.target.value })}
                placeholder="Name"
              />
              <CastPortraitControls
                campaignId={campaign.id}
                entryId={entry.id}
                portraitUrl={draft.portraitUrl || ''}
                onDraftChange={onDraftChange}
                onPortraitFile={onPortraitFile}
              />
              {entry.canManageVisibility && (
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={draft.visibleToPlayers !== false}
                    onChange={(event) => onDraftChange(campaign.id, entry.id, { visibleToPlayers: event.target.checked })}
                  />
                  Show to players
                </label>
              )}
              {entry.castType !== 'player' && (
                <CastCombatFields
                  campaignId={campaign.id}
                  entryId={entry.id}
                  draft={draft}
                  onDraftChange={onDraftChange}
                />
              )}
              <textarea
                value={draft.publicDescription || ''}
                onChange={(event) => onDraftChange(campaign.id, entry.id, { publicDescription: event.target.value })}
                placeholder="Description shown to players"
                rows={3}
              />
              <textarea
                value={draft.gmNotes || ''}
                onChange={(event) => onDraftChange(campaign.id, entry.id, { gmNotes: event.target.value })}
                placeholder="GM notes"
                rows={3}
              />
              <div className="button-row">
                <button type="button" onClick={() => onSave(entry)}>Save</button>
                {entry.canDelete && <button type="button" onClick={() => onDelete(entry)}>Delete</button>}
              </div>
            </div>
          ) : (
            <div className="cast-readonly">
              <p>{entry.publicDescription || 'No public description yet.'}</p>
              {entry.gmNotes && <small>GM notes: {entry.gmNotes}</small>}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function CastCombatFields({ campaignId, entryId, draft, onDraftChange }) {
  return (
    <section className="cast-combat-fields">
      <div className="entity-hp-row">
        <input
          value={draft.currentHealth || ''}
          onChange={(event) => onDraftChange(campaignId, entryId, { currentHealth: event.target.value })}
          placeholder="Current health"
          aria-label="Current health"
        />
        <span>/</span>
        <input
          value={draft.maxHealth || ''}
          onChange={(event) => onDraftChange(campaignId, entryId, { maxHealth: event.target.value })}
          placeholder="Max health"
          aria-label="Maximum health"
        />
      </div>
      <textarea
        value={draft.combatStatsPublic || ''}
        onChange={(event) => onDraftChange(campaignId, entryId, { combatStatsPublic: event.target.value })}
        placeholder="Combat stats visible to players"
        rows={3}
      />
      <textarea
        value={draft.combatStatsGm || ''}
        onChange={(event) => onDraftChange(campaignId, entryId, { combatStatsGm: event.target.value })}
        placeholder="GM-only combat stats"
        rows={3}
      />
      <textarea
        value={draft.statusEffectsPublic || ''}
        onChange={(event) => onDraftChange(campaignId, entryId, { statusEffectsPublic: event.target.value })}
        placeholder="Status effects visible to players"
        rows={3}
      />
      <textarea
        value={draft.statusEffectsGm || ''}
        onChange={(event) => onDraftChange(campaignId, entryId, { statusEffectsGm: event.target.value })}
        placeholder="GM-only status effects"
        rows={3}
      />
    </section>
  );
}

function CastPortraitControls({ campaignId, entryId, portraitUrl, onDraftChange, onPortraitFile }) {
  return (
    <div className="cast-portrait-controls">
      <input
        value={portraitUrl}
        onChange={(event) => onDraftChange(campaignId, entryId, { portraitUrl: event.target.value })}
        placeholder="Portrait image URL"
      />
      <label className="file-control compact-file">
        <span>Upload</span>
        <input type="file" accept="image/*" onChange={(event) => onPortraitFile(campaignId, entryId, event.target.files?.[0])} />
      </label>
      <small>Square image, 512x512 or smaller.</small>
    </div>
  );
}

function AccountModal({
  user,
  draft,
  onDraftChange,
  onPortraitFile,
  onSubmit,
  onCancel
}) {
  const avatarUrl = draft.useGravatar ? user.gravatarUrl : draft.profileImageUrl;
  const initials = getInitials(draft.displayName || user.email);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal account-modal" role="dialog" aria-modal="true" aria-label="Account settings">
        <header>
          <div>
            <strong>Account</strong>
            <small>Profile info and forum preferences</small>
          </div>
          <button type="button" onClick={onCancel}>Cancel</button>
        </header>

        <form className="account-form" onSubmit={onSubmit}>
          <div className="account-profile-row">
            <div className="account-avatar-preview" aria-hidden="true">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials}</span>}
            </div>
            <div className="account-picture-tools">
              <label className="file-button">
                Upload profile picture
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => onPortraitFile(event.target.files?.[0])}
                />
              </label>
              {draft.profileImageUrl && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onDraftChange((current) => ({ ...current, profileImageUrl: '' }))}
                >
                  Remove uploaded picture
                </button>
              )}
              <small>Square image, 512x512 or smaller. Larger or non-square uploads open the crop tool.</small>
            </div>
          </div>

          <AccountStats stats={user.stats} />

          <label>
            Email
            <input value={user.email} readOnly />
          </label>

          <label>
            Display name
            <input
              value={draft.displayName}
              onChange={(event) => onDraftChange((current) => ({ ...current, displayName: event.target.value }))}
              maxLength={120}
            />
          </label>

          <div className="account-two-column">
            <label>
              Pronouns
              <input
                value={draft.profilePronouns}
                onChange={(event) => onDraftChange((current) => ({ ...current, profilePronouns: event.target.value }))}
                maxLength={80}
                placeholder="Optional"
              />
            </label>
            <label>
              Time zone
              <input
                value={draft.profileTimezone}
                onChange={(event) => onDraftChange((current) => ({ ...current, profileTimezone: event.target.value }))}
                maxLength={80}
                placeholder="Optional"
              />
            </label>
          </div>

          <label>
            About you
            <textarea
              value={draft.profileAbout}
              onChange={(event) => onDraftChange((current) => ({ ...current, profileAbout: event.target.value }))}
              maxLength={4000}
              placeholder="A short public profile note"
              rows={5}
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.useGravatar}
              onChange={(event) => onDraftChange((current) => ({ ...current, useGravatar: event.target.checked }))}
            />
            Use my Gravatar picture for this account
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.autoSubscribeForumThreads}
              onChange={(event) => onDraftChange((current) => ({ ...current, autoSubscribeForumThreads: event.target.checked }))}
            />
            Auto-subscribe me to all campaign threads I can access
          </label>

          <div className="button-row">
            <button type="submit">Save account</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AccountStats({ stats = {} }) {
  const items = [
    ['Posts made', stats.postsMade],
    ['Threads started', stats.threadsStarted],
    ['Dice rolls made', stats.diceRollsMade],
    ['Campaigns owned', stats.campaignsOwned],
    ['Campaigns joined', stats.campaignsJoined],
    ['Subscribed threads', stats.subscribedThreads]
  ];

  return (
    <section className="account-stats" aria-label="Account statistics">
      <div>
        <strong>Statistics</strong>
        <small>Your activity across campaigns and forums.</small>
      </div>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{Number(value || 0).toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PortraitCropModal({ crop, onChange, onCancel, onApply }) {
  const previewSize = 280;
  const previewScale = previewSize / 512;
  const previewImageStyle = {
    width: `${crop.scaledWidth * previewScale}px`,
    height: `${crop.scaledHeight * previewScale}px`,
    transform: `translate(${-crop.offsetX * previewScale}px, ${-crop.offsetY * previewScale}px)`
  };

  function updateOffset(key, value) {
    const maxKey = key === 'offsetX' ? 'maxOffsetX' : 'maxOffsetY';
    onChange((current) => ({
      ...current,
      [key]: clampNumber(value, 0, current[maxKey], 0)
    }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="portrait-crop-modal" role="dialog" aria-modal="true" aria-label="Crop portrait image">
        <header>
          <div>
            <strong>Crop portrait</strong>
            <small>Shortest edge has been scaled to 512px. Position the square crop, then apply.</small>
          </div>
          <button type="button" onClick={onCancel}>Cancel</button>
        </header>

        <div className="portrait-crop-layout">
          <div className="portrait-crop-preview" style={{ width: previewSize, height: previewSize }}>
            <img src={crop.src} alt="" style={previewImageStyle} />
          </div>
          <div className="portrait-crop-controls">
            <small>
              Source: {crop.imageWidth}x{crop.imageHeight}. Saved portrait: 512x512.
            </small>
            {crop.maxOffsetX > 0 && (
              <label>
                Horizontal position
                <input
                  type="range"
                  min="0"
                  max={crop.maxOffsetX}
                  value={crop.offsetX}
                  onChange={(event) => updateOffset('offsetX', event.target.value)}
                />
              </label>
            )}
            {crop.maxOffsetY > 0 && (
              <label>
                Vertical position
                <input
                  type="range"
                  min="0"
                  max={crop.maxOffsetY}
                  value={crop.offsetY}
                  onChange={(event) => updateOffset('offsetY', event.target.value)}
                />
              </label>
            )}
            {!crop.maxOffsetX && !crop.maxOffsetY && <small>This image is already square; it will be resized to 512x512.</small>}
            <button type="button" onClick={onApply}>Apply portrait</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TestNotificationModal({ info, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal test-email-modal" role="dialog" aria-modal="true" aria-label="Test notification email">
        <header>
          <strong>{info.sent ? 'Test notification sent' : 'Test notification failed'}</strong>
        </header>
        <dl className="test-email-details">
          <div>
            <dt>To</dt>
            <dd>{info.to}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd>{info.from}</dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>{info.subject}</dd>
          </div>
          <div>
            <dt>Campaign</dt>
            <dd>{info.campaignName}</dd>
          </div>
          <div>
            <dt>Thread</dt>
            <dd>{info.threadTitle}</dd>
          </div>
          <div>
            <dt>Forum Link</dt>
            <dd><a href={info.threadUrl} target="_blank" rel="noopener noreferrer">{info.threadUrl}</a></dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>{info.transport || 'SMTP'}</dd>
          </div>
          <div>
            <dt>SMTP Host</dt>
            <dd>{info.smtpHost || ''}</dd>
          </div>
          {info.error && (
            <div>
              <dt>Error</dt>
              <dd>{info.error.code ? `${info.error.code}: ` : ''}{info.error.message}</dd>
            </div>
          )}
        </dl>
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

function ForumPage({
  campaign,
  threads,
  selectedThread,
  postIdentities,
  threadDraft,
  replyDraft,
  message,
  error,
  authUser,
  portraitRefreshKey,
  onOpenAccount,
  onLogout,
  onRefresh,
  onSelectThread,
  onThreadDraftChange,
  onCreateThread,
  onAssignThread,
  onSetThreadVisibility,
  onReplyDraftChange,
  onCreatePost,
  editingPost,
  onStartEditPost,
  onEditDraftChange,
  onCancelEditPost,
  onSaveEditPost,
  onDeletePost,
  onMarkThreadRead,
  onToggleSubscription,
  onSendTestNotification
}) {
  const [newThreadModalOpen, setNewThreadModalOpen] = useState(false);
  const [threadPage, setThreadPage] = useState(1);
  const [threadPageSize, setThreadPageSize] = useState(10);
  const [postPage, setPostPage] = useState(1);
  const [postPageSize, setPostPageSize] = useState(10);
  const pagedThreads = paginateItems(threads, threadPage, threadPageSize);
  const posts = selectedThread?.posts || [];
  const pagedPosts = paginateItems(posts, postPage, postPageSize);
  const canPostInSelectedThread = canPostInCampaignThread(selectedThread, campaign, authUser);

  useEffect(() => {
    setPostPage(initialThreadPostPage(selectedThread, postPageSize));
  }, [selectedThread?.id, postPageSize]);

  useEffect(() => {
    if (selectedThread || !threads.length) return;
    onSelectThread(threads[0].id);
  }, [selectedThread?.id, threads]);

  useEffect(() => {
    window.requestAnimationFrame(() => scrollThreadToUnreadOrBottom(selectedThread));
  }, [selectedThread?.id, postPage, postPageSize, selectedThread?.posts?.length]);

  function handleCreateThread(event) {
    event.preventDefault();
    onCreateThread();
    setNewThreadModalOpen(false);
  }

  return (
    <main className="forum-page">
      <SiteHeader
        authUser={authUser}
        title={campaign?.name || 'Campaign Forums'}
        subtitle={campaign ? `${threads.length} threads` : 'Loading campaign'}
        onOpenAccount={onOpenAccount}
        onLogout={onLogout}
        actions={<button type="button" onClick={onRefresh} disabled={!campaign}>Refresh</button>}
      />

      <section className="forum-page-layout">
        <aside className="forum-index-panel">
          <div className="forum-panel-header">
            <div>
              <strong>Threads</strong>
              {campaign && <small>{campaign.role === 'owner' ? 'Owner' : 'Member'}</small>}
            </div>
            <button type="button" onClick={() => setNewThreadModalOpen(true)} disabled={!campaign}>New Thread</button>
          </div>
          <div className="forum-thread-list">
            {pagedThreads.items.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={selectedThread?.id === thread.id ? 'selected' : ''}
                onClick={() => onSelectThread(thread.id)}
              >
                <span>{thread.title}</span>
                <small>
                  {thread.postCount} posts
                  {thread.mapName ? ` · ${thread.mapName}` : ''}
                  {` · ${formatForumThreadVisibility(thread.visibilityLevel)}`}
                </small>
                <ThreadAuthorMeta thread={thread} />
                {thread.hasUnread && <strong className="unread-pill">{thread.unreadCount} unread</strong>}
              </button>
            ))}
            {!threads.length && <p>No forum threads yet.</p>}
          </div>
          <PaginationControls
            label="Threads"
            totalItems={threads.length}
            page={pagedThreads.currentPage}
            pageSize={threadPageSize}
            onPageChange={setThreadPage}
            onPageSizeChange={(size) => {
              setThreadPageSize(size);
              setThreadPage(1);
            }}
            labelOnNewLine={1}
          />
        </aside>

        <section className="forum-main-panel">
          {selectedThread ? (
            <>
              <header className="forum-thread-header">
                <div>
                  <h2>{selectedThread.title}</h2>
                  <p>
                    {selectedThread.mapName ? `Assigned to ${selectedThread.mapName}` : 'Campaign-wide thread'}
                    {selectedThread.hasUnread ? ` · ${selectedThread.unreadCount} unread` : ' · all read'}
                  </p>
                </div>
                <div className="button-row">
                  <button type="button" onClick={() => onToggleSubscription(selectedThread)} disabled={!authUser}>
                    {selectedThread.subscribed ? 'Unsubscribe' : 'Subscribe'}
                  </button>
                  <button type="button" onClick={() => onSendTestNotification(selectedThread.id)} disabled={!authUser}>
                    Test notification
                  </button>
                  <button type="button" onClick={() => onMarkThreadRead(selectedThread.id)} disabled={!authUser || !selectedThread.posts.length}>
                    Mark all read
                  </button>
                  {campaign?.role === 'owner' && (
                    <>
                      <select
                        value={selectedThread.visibilityLevel || 'campaign'}
                        onChange={(event) => onSetThreadVisibility(selectedThread.id, event.target.value)}
                        aria-label="Thread visibility"
                      >
                        {FORUM_THREAD_VISIBILITY_LEVELS.map((level) => (
                          <option key={level.value} value={level.value}>{level.label}</option>
                        ))}
                      </select>
                      <select
                        value={selectedThread.mapId || ''}
                        onChange={(event) => onAssignThread(selectedThread.id, event.target.value)}
                        aria-label="Assign thread to map"
                      >
                        <option value="">Campaign-wide</option>
                        {(campaign?.maps || []).map((map) => (
                          <option key={map.id} value={map.id}>{map.name}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </header>
              <div className="forum-post-list">
                {pagedPosts.items.map((post) => (
                  <ForumPostArticle
                    key={post.id}
                    post={post}
                    threadId={selectedThread.id}
                    viewerUserId={authUser?.id}
                    canEdit={post.canEdit}
                    canDelete={post.canDelete}
                    portraitRefreshKey={portraitRefreshKey}
                    editingPost={editingPost}
                    onStartEditPost={onStartEditPost}
                    onEditDraftChange={onEditDraftChange}
                    onCancelEditPost={onCancelEditPost}
                    onSaveEditPost={onSaveEditPost}
                    onDeletePost={onDeletePost}
                  />
                ))}
                <footer className="forum-post-list-footer">
                  <PaginationControls
                    label="Posts"
                    totalItems={posts.length}
                    page={pagedPosts.currentPage}
                    pageSize={postPageSize}
                    onPageChange={setPostPage}
                    onPageSizeChange={(size) => {
                      setPostPageSize(size);
                      setPostPage(1);
                    }}
                    labelOnNewLine={0}
                  />
                  {canPostInSelectedThread ? (
                    <form className="forum-reply-form" onSubmit={onCreatePost}>
                      <BBCodeEditor
                        value={replyDraft}
                        onChange={onReplyDraftChange}
                        postIdentities={postIdentities}
                        portraitRefreshKey={portraitRefreshKey}
                        placeholder="Reply with BBCode"
                      />
                      <button type="submit">Post reply</button>
                    </form>
                  ) : (
                    <div className="forum-reply-form">You can read this thread, but you cannot post here.</div>
                  )}
                </footer>
              </div>
            </>
          ) : (
            <div className="empty-state">Select a thread to read it.</div>
          )}
        </section>
      </section>

      {newThreadModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal forum-thread-modal" role="dialog" aria-modal="true" aria-label="New campaign thread">
            <header>
              <div>
                <strong>New Thread</strong>
                <small>BBCode enabled</small>
              </div>
              <button type="button" onClick={() => setNewThreadModalOpen(false)}>Cancel</button>
            </header>
            <form className="forum-compose" onSubmit={handleCreateThread}>
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
              {campaign?.role === 'owner' && (
                <select
                  value={threadDraft.visibilityLevel || 'campaign'}
                  onChange={(event) => onThreadDraftChange((current) => ({ ...current, visibilityLevel: event.target.value }))}
                  aria-label="New thread visibility"
                >
                  {FORUM_THREAD_VISIBILITY_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              )}
              <BBCodeEditor
                value={threadDraft.body || ''}
                onChange={(value) => onThreadDraftChange((current) => ({ ...current, body: value }))}
                postIdentities={postIdentities}
                portraitRefreshKey={portraitRefreshKey}
                placeholder="First post"
              />
              <div className="button-row">
                <button type="submit" disabled={!campaign}>Create thread</button>
                <button type="button" onClick={() => setNewThreadModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}

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

function SiteHeader({
  authUser,
  title = 'PBPHUD',
  subtitle = 'Play-by-post RPG hub',
  onOpenAccount,
  onLogout,
  actions = null
}) {
  return (
    <header className="site-header">
      <a className="brand-link" href="/" aria-label="PBPHUD home">
        <BrandLockup title={title} subtitle={subtitle} />
      </a>
      <nav className="main-nav" aria-label="Site pages">
        <a href="/">Home</a>
        <a href="/forums">Community Forums</a>
        <a href="/games">Games List</a>
        {authUser && <a href="/dashboard">Campaign Dashboard</a>}
        <a href="/demo" target="pbphubdemo">Demo</a>
        {authUser?.communityRole === 'admin' && <a href="/admin">Admin</a>}
        {authUser && <button type="button" className="nav-button" onClick={onOpenAccount}>Account</button>}
        {authUser ? (
          <button type="button" className="nav-button" onClick={onLogout}>Sign Out</button>
        ) : (
          <a className="nav-button" href="/auth">Sign In / Register</a>
        )}
      </nav>
      {actions && <div className="site-header-actions">{actions}</div>}
    </header>
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
      </nav>
      <nav className="footer-sitemap" aria-label="Sitemap">
        <a href="/auth">Sign in</a>
        <a href="/auth?mode=register">Register</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/forums">Forums</a>
      </nav>
    </footer>
  );
}

function UserAvatar({ src, name, className = 'avatar' }) {
  const initials = getInitials(name);
  return (
    <div className={className}>
      {src ? <img src={src} alt="" /> : <span>{initials.slice(0, 2)}</span>}
    </div>
  );
}

function ThreadAuthorMeta({ thread }) {
  return (
    <span className="thread-author-meta">
      <UserAvatar src={thread.createdByAvatarUrl} name={thread.createdByDisplayName || thread.createdByUserId} className="avatar tiny" />
      <span>by {thread.createdByDisplayName || thread.createdByUserId}</span>
      {thread.createdByRoleLabel && <span>{thread.createdByRoleLabel}</span>}
      <span>{formatCount(thread.createdByPostCount, 'post')}</span>
    </span>
  );
}

function formatCount(value, noun) {
  const count = Number(value || 0);
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

function formatPlayerCapacity(playerCount, maxPlayers) {
  const currentCount = Number(playerCount || 0);
  const maxCount = Number(maxPlayers);
  const maxText = Number.isFinite(maxCount) && maxCount > 0
    ? maxCount.toLocaleString()
    : 'Open';
  return `Players: ${currentCount.toLocaleString()} / ${maxText}`;
}

function paginateItems(items, page, pageSize) {
  const totalItems = items.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  return {
    items: items.slice(startIndex, startIndex + pageSize),
    currentPage,
    pageCount,
    start: totalItems ? startIndex + 1 : 0,
    end: Math.min(startIndex + pageSize, totalItems),
    totalItems
  };
}

function initialThreadPostPage(thread, pageSize) {
  const posts = thread?.posts || [];
  if (!posts.length) return 1;
  if (thread.firstUnreadPostId) {
    const unreadIndex = posts.findIndex((post) => Number(post.id) === Number(thread.firstUnreadPostId));
    if (unreadIndex >= 0) return Math.floor(unreadIndex / pageSize) + 1;
  }
  return Math.max(1, Math.ceil(posts.length / pageSize));
}

function PaginationControls({
  label,
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  labelOnNewLine
}) {
  if (!totalItems) return null;

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), pageCount);
  const start = totalItems ? ((currentPage - 1) * pageSize) + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalItems);
  const labelNewLine = labelOnNewLine ? "labelNewLine" : "";
  const padPaginationTop = labelOnNewLine ? "pad-top-5" : "";

  return (
    <div className={`pagination-controls ${labelNewLine}`}>
      <span>{label}: {start}-{end} of {totalItems}</span>
      <label>
        <span className="label-m-l-1">Show</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <div className={`pagination-buttons ${padPaginationTop}`}>
        <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
          Previous
        </button>
        <span>Page {currentPage} of {pageCount}</span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount}>
          Next
        </button>
      </div>
    </div>
  );
}

function formatCommunityRole(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'moderator') return 'Moderator';
  return 'Community Member';
}

function buildAdminDemoOptionsFromCampaignState(campaigns = [], campaignForumThreads = {}) {
  const ownedCampaigns = campaigns
    .filter((campaign) => campaign.role === 'owner')
    .map((campaign) => ({
      id: Number(campaign.id),
      name: campaign.name,
      maps: (campaign.maps || [])
        .map((map) => ({
          id: Number(map.id),
          campaignId: Number(campaign.id),
          name: map.name,
          visibilityLevel: map.visibilityLevel
        })),
      threads: (campaignForumThreads[campaign.id] || [])
        .map((thread) => ({
          id: Number(thread.id),
          campaignId: Number(campaign.id),
          mapId: thread.mapId ? Number(thread.mapId) : null,
          title: thread.title,
          visibilityLevel: thread.visibilityLevel
        }))
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);

  return {
    campaigns: ownedCampaigns.map(({ id, name }) => ({ id, name })),
    maps: ownedCampaigns
      .flatMap((campaign) => campaign.maps)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
    threads: ownedCampaigns
      .flatMap((campaign) => campaign.threads)
      .sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id)
  };
}

function mergeAdminDemoOptions(primary = { campaigns: [], maps: [], threads: [] }, secondary = { campaigns: [], maps: [], threads: [] }) {
  const mergeById = (primaryItems = [], secondaryItems = [], labelKey = 'name') => {
    const itemsById = new Map();
    for (const item of secondaryItems) {
      itemsById.set(String(item.id), item);
    }
    for (const item of primaryItems) {
      itemsById.set(String(item.id), item);
    }
    return [...itemsById.values()].sort((a, b) => a[labelKey].localeCompare(b[labelKey]) || a.id - b.id);
  };

  return {
    campaigns: mergeById(primary.campaigns, secondary.campaigns),
    maps: mergeById(primary.maps, secondary.maps),
    threads: mergeById(primary.threads, secondary.threads, 'title')
  };
}

function buildDemoAssignmentDraft(assignment = null, options = { campaigns: [], maps: [], threads: [] }) {
  const draft = {
    campaignId: assignment?.campaignId ? String(assignment.campaignId) : '',
    mapId: assignment?.mapId ? String(assignment.mapId) : '',
    threadId: assignment?.threadId ? String(assignment.threadId) : ''
  };
  const campaignIds = new Set((options.campaigns || []).map((campaign) => String(campaign.id)));
  if (draft.campaignId && !campaignIds.has(draft.campaignId)) {
    return { campaignId: '', mapId: '', threadId: '' };
  }

  const mapIds = new Set(
    (options.maps || [])
      .filter((map) => String(map.campaignId) === draft.campaignId)
      .map((map) => String(map.id))
  );
  if (draft.mapId && !mapIds.has(draft.mapId)) {
    draft.mapId = '';
    draft.threadId = '';
  }

  const threadIds = new Set(
    (options.threads || [])
      .filter((thread) => (
        String(thread.campaignId) === draft.campaignId &&
        String(thread.mapId || '') === String(draft.mapId || '')
      ))
      .map((thread) => String(thread.id))
  );
  if (draft.threadId && !threadIds.has(draft.threadId)) {
    draft.threadId = '';
  }

  return draft;
}

function AdminPage({
  authUser,
  users,
  demoAssignment,
  demoOptions,
  demoDraft,
  message,
  error,
  onOpenAccount,
  onLogout,
  onDemoDraftChange,
  onSaveDemoAssignment,
  onUpdateRole
}) {
  const isAdmin = authUser?.communityRole === 'admin';
  const campaignMaps = demoOptions.maps.filter((map) => String(map.campaignId) === String(demoDraft.campaignId));
  const campaignThreads = demoOptions.threads.filter((thread) => {
    if (String(thread.campaignId) !== String(demoDraft.campaignId)) return false;
    if (!demoDraft.mapId) return false;
    return String(thread.mapId) === String(demoDraft.mapId);
  });
  return (
    <main className="admin-page">
      <SiteHeader
        authUser={authUser}
        title="Community Admin"
        subtitle="Manage Site Options"
        onOpenAccount={onOpenAccount}
        onLogout={onLogout}
      />

      <section className="admin-layout">
        <header className="page-section-header">
          <div>
            <h1>Community Members</h1>
            <p>Assign public forum ranks for admins, moderators, and community members.</p>
          </div>
        </header>

        {!isAdmin ? (
          <div className="empty-state">Admin access is required.</div>
        ) : (
          <>
            <form className="admin-demo-card" onSubmit={onSaveDemoAssignment}>
              <div>
                <h2>Demo Link</h2>
                <p>Choose the campaign, map, and forum thread opened from the Demo header link.</p>
                {demoAssignment?.campaignName && (
                  <small>
                    Current: {demoAssignment.campaignName}
                    {demoAssignment.mapName ? ` / ${demoAssignment.mapName}` : ''}
                    {demoAssignment.threadTitle ? ` / ${demoAssignment.threadTitle}` : ''}
                  </small>
                )}
              </div>
              {(message || error) && <p className={`auth-message ${error ? 'error' : ''}`}>{error || message}</p>}
              <div className="admin-demo-grid">
                <label>
                  <span>Campaign</span>
                  <select
                    value={demoDraft.campaignId}
                    onChange={(event) => onDemoDraftChange('campaignId', event.target.value)}
                  >
                    <option value="">{demoOptions.campaigns.length ? 'No campaign selected' : 'No owned campaigns available'}</option>
                    {demoOptions.campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Map</span>
                  <select
                    value={demoDraft.mapId}
                    onChange={(event) => onDemoDraftChange('mapId', event.target.value)}
                    disabled={!demoDraft.campaignId}
                  >
                    <option value="">No campaign map</option>
                    {campaignMaps.map((map) => (
                      <option key={map.id} value={map.id}>{map.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Forum Thread</span>
                  <select
                    value={demoDraft.threadId}
                    onChange={(event) => onDemoDraftChange('threadId', event.target.value)}
                    disabled={!demoDraft.mapId}
                  >
                    <option value="">No forum thread</option>
                    {campaignThreads.map((thread) => (
                      <option key={thread.id} value={thread.id}>{thread.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit">Save Demo Info</button>
            </form>

            <div className="admin-user-list">
              {users.map((user) => (
                <article className="admin-user-row" key={user.userId}>
                  <div>
                    <strong>{user.displayName || user.email}</strong>
                    <small>{user.email}</small>
                    <small>{formatCount(user.postsMade, 'post')}</small>
                  </div>
                  <label>
                    <span>Rank</span>
                    <select
                      value={user.communityRole}
                      onChange={(event) => onUpdateRole(user, event.target.value)}
                    >
                      <option value="admin">Admin</option>
                      <option value="moderator">Moderator</option>
                      <option value="community_member">Community Member</option>
                    </select>
                  </label>
                </article>
              ))}
              {!users.length && <div className="empty-state">No users found.</div>}
            </div>
          </>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}

function ForumPostArticle({
  post,
  threadId,
  viewerUserId,
  compact = false,
  canEdit: canEditOverride = null,
  canDelete = false,
  portraitRefreshKey = 0,
  editingPost,
  onStartEditPost,
  onEditDraftChange,
  onCancelEditPost,
  onSaveEditPost,
  onDeletePost,
  onMarkThreadRead,
  onToggleSubscription,
  onSendTestNotification
}) {
  const isAuthor = post.authorUserId === viewerUserId;
  const isEditing = editingPost?.postId === post.id;
  const canEdit = (canEditOverride ?? isAuthor) && !post.deleted;

  return (
    <article
      id={`forum-post-${post.id}`}
      className={`forum-post ${compact ? 'compact' : ''} ${post.deleted ? 'deleted' : ''} ${post.unread ? 'unread-post' : ''}`}
    >
      {!compact && (
        <aside className="post-author">
          <UserAvatar src={post.authorAvatarUrl} name={post.authorDisplayName || post.authorUserId} className="avatar" />
          <strong>{post.authorDisplayName || post.authorUserId}</strong>
          {post.authorRoleLabel && <small>{post.authorRoleLabel}</small>}
          <small>{formatCount(post.authorPostCount, 'post')}</small>
        </aside>
      )}
      <div className="post-body">
        <header>
          <div>
            {compact && (
              <div className="compact-author-line">
                <UserAvatar src={post.authorAvatarUrl} name={post.authorDisplayName || post.authorUserId} className="avatar small" />
                <strong>{post.authorDisplayName || post.authorUserId}</strong>
                {post.authorRoleLabel && <small>{post.authorRoleLabel}</small>}
                <small>{formatCount(post.authorPostCount, 'post')}</small>
              </div>
            )}
            <time>{formatDateTime(post.createdAt)}</time>
            {post.editedAt && !post.deleted && <small>Edited {formatDateTime(post.editedAt)}</small>}
            {post.deleted && <small>Post text deleted {formatDateTime(post.deletedAt)}</small>}
            {post.unread && <small className="unread-label">Unread</small>}
          </div>
          <div className="post-actions">
            {canEdit && !isEditing && <button type="button" onClick={() => onStartEditPost(post)}>Edit</button>}
            {canDelete && !post.deleted && (
              <button type="button" onClick={() => onDeletePost(threadId, post.id)}>Delete</button>
            )}
          </div>
        </header>

        {isEditing ? (
          <form className="post-edit-form" onSubmit={(event) => onSaveEditPost(event, threadId)}>
            <BBCodeEditor
              value={editingPost.body}
              onChange={onEditDraftChange}
              portraitRefreshKey={portraitRefreshKey}
              placeholder="Edit post text. Existing dice rolls will not change."
            />
            <div className="button-row">
              <button type="submit">Save edit</button>
              <button type="button" onClick={onCancelEditPost}>Cancel</button>
            </div>
            <small>Dice rolls are immutable. New roll commands typed during edits will not be rolled.</small>
          </form>
        ) : post.deleted ? (
          <p className="deleted-post-note">This post text was deleted. Dice rolls are preserved below.</p>
        ) : (
          <div className="bbcode-body" dangerouslySetInnerHTML={{ __html: renderBbcode(post.body, portraitRefreshKey) }} />
        )}

        <DiceRollList rolls={post.rolls || []} />
      </div>
    </article>
  );
}

function DiceRollList({ rolls }) {
  if (!rolls.length) return null;
  return (
    <div className="dice-roll-list" aria-label="Dice rolls">
      {rolls.map((roll) => (
        <article className="dice-roll-card" key={roll.id}>
          <header>
            <div>
              {roll.result?.purpose && <strong>{roll.result.purpose}</strong>}
              <small>{roll.commandText}</small>
            </div>
            <span>{formatDateTime(roll.createdAt)}</span>
          </header>
          {roll.rollType === 'shadowrun' ? (
            <ShadowrunRollResult result={roll.result} />
          ) : (
            <StandardRollResult result={roll.result} />
          )}
        </article>
      ))}
    </div>
  );
}

function StandardRollResult({ result }) {
  const modifierText = result.modifier
    ? ` ${result.modifier > 0 ? '+' : '-'} ${Math.abs(result.modifier)}`
    : '';
  return (
    <div className="dice-roll-result">
      <span>{result.diceCount}d{result.dieSize}{modifierText}</span>
      <strong>Total: {result.total}</strong>
      <small>Dice: {result.dice.join(', ')}{result.modifier ? ` · subtotal ${result.subtotal}` : ''}</small>
    </div>
  );
}

function ShadowrunRollResult({ result }) {
  return (
    <div className="dice-roll-result">
      <span>{result.diceCount}d6{result.useEdge ? ' with Edge' : ''}</span>
      <strong>{result.hits} hits</strong>
      <small>
        5s: {result.fives} · 6s: {result.sixes} · 1s: {result.ones}
        {result.glitch ? ` · ${result.criticalGlitch ? 'Critical glitch' : 'Glitch'}` : ''}
      </small>
      <small>Dice: {result.dice.join(', ')}{result.edgeDice?.length ? ` · Edge explosions: ${result.edgeDice.join(', ')}` : ''}</small>
    </div>
  );
}

function PublicForumsPage({
  authUser,
  sections,
  threadsBySection,
  sectionSlug,
  threadId,
  selectedThread,
  newThreadSection,
  threadDraft,
  replyDraft,
  message,
  error,
  portraitRefreshKey,
  onOpenAccount,
  onLogout,
  onOpenNewThread,
  onCloseNewThread,
  onThreadDraftChange,
  onReplyDraftChange,
  onCreateThread,
  onCreatePost,
  editingPost,
  onStartEditPost,
  onEditDraftChange,
  onCancelEditPost,
  onSaveEditPost,
  onDeletePost,
  onToggleSticky
}) {
  const [threadPage, setThreadPage] = useState(1);
  const [threadPageSize, setThreadPageSize] = useState(10);
  const [postPage, setPostPage] = useState(1);
  const [postPageSize, setPostPageSize] = useState(10);
  const selectedSection = sectionSlug ? sections.find((section) => section.slug === sectionSlug) : null;
  const activeSection = selectedSection || (sectionSlug ? { slug: sectionSlug, title: sectionSlug, description: '' } : null);
  const sectionThreads = sectionSlug ? (threadsBySection[sectionSlug] || []) : [];
  const pagedThreads = paginateItems(sectionThreads, threadPage, threadPageSize);
  const selectedPosts = selectedThread?.posts || [];
  const pagedPosts = paginateItems(selectedPosts, postPage, postPageSize);

  useEffect(() => {
    setPostPage(1);
  }, [selectedThread?.id]);

  useEffect(() => {
    setThreadPage(1);
  }, [sectionSlug]);

  return (
    <main className="forum-page public-forums-page">
      <SiteHeader
        authUser={authUser}
        title={threadId && selectedThread ? selectedThread.title : activeSection?.title || 'Community Forums'}
        subtitle={threadId && selectedThread ? selectedThread.sectionTitle : activeSection?.description || 'Public PBPHUD discussion'}
        onOpenAccount={onOpenAccount}
        onLogout={onLogout}
      />

      <section className="public-forum-layout traditional-forum-layout">
        <section className="public-forum-card">
          <div className="forum-panel-header">
            <div>
              <strong>{threadId ? 'Thread' : activeSection ? 'Threads' : 'Forums'}</strong>
              <small>Anyone can read. Sign in to post.</small>
            </div>
            {(sectionSlug || threadId) && (
              <a className="button no-underline" href={threadId ? `/forums/${selectedThread?.sectionSlug || sectionSlug}` : '/forums'}>
                Back
              </a>
            )}
          </div>
          {!activeSection && !threadId && (
            <div className="traditional-forum-list public-section-list">
              {sections.map((section) => (
                <a className="traditional-forum-row public-category-row" key={section.slug} href={`/forums/${encodeURIComponent(section.slug)}`}>
                  <span>
                    <strong>{section.title}</strong>
                    <small>{section.description}</small>
                  </span>
                  <span>{formatCount(section.threadCount, 'thread')}</span>
                  <span>{formatCount(section.postCount, 'post')}</span>
                  <span>{section.latestPostAt ? formatDateTime(section.latestPostAt) : 'No posts yet'}</span>
                </a>
              ))}
              {!sections.length && <p className="empty-subforum">No forum categories yet.</p>}
            </div>
          )}

          {activeSection && !threadId && (
            <div className="traditional-thread-list">
              <div className="public-section-actions">
                <button type="button" onClick={() => onOpenNewThread(activeSection)}>New post</button>
              </div>
              {pagedThreads.items.map((thread) => (
                <a
                  key={thread.id}
                  className="traditional-thread-row"
                  href={`/forums/${encodeURIComponent(activeSection.slug)}/threads/${thread.id}`}
                >
                  <span>
                    <strong>{thread.sticky && <span className="sticky-pill">Sticky</span>} {thread.title}</strong>
                    <ThreadAuthorMeta thread={thread} />
                  </span>
                  <span>{formatCount(thread.postCount, 'post')}</span>
                  <span>{thread.latestPostAt ? formatDateTime(thread.latestPostAt) : 'No posts yet'}</span>
                </a>
              ))}
              {!sectionThreads.length && <p className="empty-subforum">No threads in this forum yet.</p>}
              <PaginationControls
                label="Threads"
                totalItems={sectionThreads.length}
                page={pagedThreads.currentPage}
                pageSize={threadPageSize}
                onPageChange={setThreadPage}
                onPageSizeChange={(size) => {
                  setThreadPageSize(size);
                  setThreadPage(1);
                }}
                labelOnNewLine={1}
              />
            </div>
          )}

          {threadId && (
            <>
              {selectedThread ? (
                <>
                  <header className="forum-thread-header">
                    <div>
                      <h2>{selectedThread.title}</h2>
                      <p>{selectedThread.sectionTitle || 'Public forum thread'} · {formatCount(selectedThread.postCount, 'post')}</p>
                    </div>
                    {selectedThread.canModerate && (
                      <button type="button" onClick={() => onToggleSticky(selectedThread)}>
                        {selectedThread.sticky ? 'Unstick thread' : 'Make sticky'}
                      </button>
                    )}
                  </header>
                  <div className="forum-post-list">
                    {pagedPosts.items.map((post) => (
                      <ForumPostArticle
                        key={post.id}
                        post={post}
                        threadId={selectedThread.id}
                        viewerUserId={authUser?.id || ''}
                        canEdit={post.canEdit}
                        canDelete={post.canDelete}
                        portraitRefreshKey={portraitRefreshKey}
                        editingPost={editingPost}
                        onStartEditPost={onStartEditPost}
                        onEditDraftChange={onEditDraftChange}
                        onCancelEditPost={onCancelEditPost}
                        onSaveEditPost={onSaveEditPost}
                        onDeletePost={onDeletePost}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    label="Posts"
                    totalItems={selectedPosts.length}
                    page={pagedPosts.currentPage}
                    pageSize={postPageSize}
                    onPageChange={setPostPage}
                    onPageSizeChange={(size) => {
                      setPostPageSize(size);
                      setPostPage(1);
                    }}
                    labelOnNewLine={0}
                  />
                  {authUser ? (
                    <form className="forum-reply-form" onSubmit={onCreatePost}>
                      <BBCodeEditor
                        value={replyDraft}
                        onChange={onReplyDraftChange}
                        portraitRefreshKey={portraitRefreshKey}
                        placeholder="Reply with BBCode"
                      />
                      <button type="submit">Post reply</button>
                    </form>
                  ) : (
                    <p className="auth-required-note"><a href="/auth">Sign in</a> or <a href="/auth?mode=register">register</a> to reply.</p>
                  )}
                </>
              ) : (
                <div className="empty-state">Loading thread...</div>
              )}
            </>
          )}
        </section>
      </section>

      {newThreadSection && (
        <PublicThreadModal
          section={newThreadSection}
          draft={threadDraft}
          portraitRefreshKey={portraitRefreshKey}
          onDraftChange={onThreadDraftChange}
          onSubmit={onCreateThread}
          onCancel={onCloseNewThread}
        />
      )}

      <SiteFooter />
    </main>
  );
}

function PublicThreadModal({
  section,
  draft,
  portraitRefreshKey,
  onDraftChange,
  onSubmit,
  onCancel
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal public-thread-modal" role="dialog" aria-modal="true" aria-label={`New post in ${section.title}`}>
        <header>
          <div>
            <strong>New post</strong>
            <small>{section.title}</small>
          </div>
          <button type="button" onClick={onCancel}>Cancel</button>
        </header>
        <form className="forum-compose" onSubmit={onSubmit}>
          <input
            value={draft.title || ''}
            onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
            placeholder="Thread title"
          />
          <BBCodeEditor
            value={draft.body || ''}
            onChange={(value) => onDraftChange((current) => ({ ...current, body: value }))}
            portraitRefreshKey={portraitRefreshKey}
            placeholder="First post"
          />
          <div className="button-row">
            <button type="submit">Create thread</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MapForumPanel({
  activeMap,
  threads,
  selectedThread,
  postIdentities,
  replyDraft,
  portraitRefreshKey,
  onReplyDraftChange,
  onCreatePost,
  viewerUserId,
  editingPost,
  onStartEditPost,
  onEditDraftChange,
  onCancelEditPost,
  onSaveEditPost,
  onDeletePost,
  onMarkThreadRead,
  onToggleSubscription,
  onSendTestNotification
}) {
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [postPage, setPostPage] = useState(1);
  const [postPageSize, setPostPageSize] = useState(10);
  const posts = selectedThread?.posts || [];
  const pagedPosts = paginateItems(posts, postPage, postPageSize);

  useEffect(() => {
    setPostPage(initialThreadPostPage(selectedThread, postPageSize));
  }, [selectedThread?.id, postPageSize]);

  useEffect(() => {
    window.requestAnimationFrame(() => scrollThreadToUnreadOrBottom(selectedThread));
  }, [selectedThread?.id, postPage, postPageSize, selectedThread?.posts?.length]);

  if (!activeMap?.campaignId) {
    return <div className="empty-state">Forums are available for campaign maps.</div>;
  }

  function handleSubmitReply(event) {
    if (!replyDraft.trim()) {
      event.preventDefault();
      return;
    }
    onCreatePost(event);
    setReplyModalOpen(false);
  }

  return (
    <section className="map-forum-panel">
      <section className="forum-thread-view">
        {selectedThread ? (
          <>
            <header className="forum-thread-header">
              <div>
                <h2>{selectedThread.title}</h2>
                <p>
                  {selectedThread.mapName ? `Assigned to ${selectedThread.mapName}` : 'Campaign-wide'}
                  {selectedThread.hasUnread ? ` · ${selectedThread.unreadCount} unread` : ' · all read'}
                </p>
              </div>
              <div className="button-row">
                <button type="button" onClick={() => onToggleSubscription(selectedThread)} disabled={!viewerUserId}>
                  {selectedThread.subscribed ? 'Unsubscribe' : 'Subscribe'}
                </button>
                <button type="button" onClick={() => onSendTestNotification(selectedThread.id)} disabled={!viewerUserId}>
                  Test notification
                </button>
                <button type="button" onClick={() => onMarkThreadRead(selectedThread.id)} disabled={!viewerUserId || !selectedThread.posts.length}>
                  Mark all read
                </button>
              </div>
            </header>
            <div className="forum-post-list">
              {pagedPosts.items.map((post) => (
                <ForumPostArticle
                  key={post.id}
                  post={post}
                  threadId={selectedThread.id}
                  viewerUserId={viewerUserId}
                  compact
                  canEdit={post.canEdit}
                  canDelete={post.canDelete}
                  portraitRefreshKey={portraitRefreshKey}
                  editingPost={editingPost}
                  onStartEditPost={onStartEditPost}
                  onEditDraftChange={onEditDraftChange}
                  onCancelEditPost={onCancelEditPost}
                  onSaveEditPost={onSaveEditPost}
                  onDeletePost={onDeletePost}
                />
              ))}
            </div>
            <PaginationControls
              label="Posts"
              totalItems={posts.length}
              page={pagedPosts.currentPage}
              pageSize={postPageSize}
              onPageChange={setPostPage}
              onPageSizeChange={(size) => {
                setPostPageSize(size);
                setPostPage(1);
              }}
              labelOnNewLine={0}
            />
            <footer className="forum-reply-actions">
              <button type="button" onClick={() => setReplyModalOpen(true)} disabled={!selectedThread.permissions?.canPost}>
                New post
              </button>
            </footer>
          </>
        ) : (
          <div className="empty-state">
            {threads.length ? 'Loading linked forum thread...' : 'No forum thread is linked to this map yet. Link one from the campaign editor.'}
          </div>
        )}
      </section>

      {replyModalOpen && selectedThread?.permissions?.canPost && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal map-forum-post-modal" role="dialog" aria-modal="true" aria-label={`New post in ${selectedThread.title}`}>
            <header>
              <div>
                <strong>New post</strong>
                <small>{selectedThread.title}</small>
              </div>
              <button type="button" onClick={() => setReplyModalOpen(false)}>Cancel</button>
            </header>
            <form className="forum-compose" onSubmit={handleSubmitReply}>
              <BBCodeEditor
                value={replyDraft}
                onChange={onReplyDraftChange}
                postIdentities={postIdentities}
                portraitRefreshKey={portraitRefreshKey}
                placeholder="Reply with BBCode"
              />
              <div className="button-row">
                <button type="submit">Post reply</button>
                <button type="button" onClick={() => setReplyModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function BBCodeEditor({ value, onChange, placeholder, postIdentities = [], portraitRefreshKey = 0 }) {
  const textareaRef = useRef(null);
  const [diceModalOpen, setDiceModalOpen] = useState(false);
  const [shadowrunDiceModalOpen, setShadowrunDiceModalOpen] = useState(false);
  const [diceDraft, setDiceDraft] = useState({
    diceCount: '1',
    dieSize: '20',
    modifier: '0',
    purpose: ''
  });
  const [shadowrunDiceDraft, setShadowrunDiceDraft] = useState({
    diceCount: '12',
    useEdge: false,
    purpose: ''
  });

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

  function insertCenteredImage() {
    const url = window.prompt('Enter image URL');
    if (!url) return;
    wrapSelection('[img=center]', '[/img]', url);
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

  function insertInlineCommand(command) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const prefix = value && !value.endsWith('\n') ? '\n' : '';
    const nextText = `${value.slice(0, start)}${prefix}${command}${value.slice(start)}`;
    onChange(nextText);
    window.requestAnimationFrame(() => {
      if (!textarea) return;
      const cursor = start + prefix.length + command.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function insertDiceRoll() {
    const diceCount = clampNumber(diceDraft.diceCount, 1, 100, 1);
    const dieSize = clampNumber(diceDraft.dieSize, 2, 1000, 20);
    const modifier = clampNumber(diceDraft.modifier, -10000, 10000, 0);
    const purpose = diceDraft.purpose.trim();
    if (!purpose) {
      window.alert('Enter what this roll is for.');
      return;
    }
    insertInlineCommand(
      `[roll dice=${diceCount} size=${dieSize} bonus=${modifier} for=${encodeBbcodeAttribute(purpose)}]`
    );
    setDiceDraft({ diceCount: '1', dieSize: '20', modifier: '0', purpose: '' });
    setDiceModalOpen(false);
  }

  function insertShadowrunDiceRoll() {
    const diceCount = clampNumber(shadowrunDiceDraft.diceCount, 1, 100, 12);
    const purpose = shadowrunDiceDraft.purpose.trim();
    if (!purpose) {
      window.alert('Enter what this roll is for.');
      return;
    }
    insertInlineCommand(
      `[sr dice=${diceCount} edge=${shadowrunDiceDraft.useEdge ? 'true' : 'false'} for=${encodeBbcodeAttribute(purpose)}]`
    );
    setShadowrunDiceDraft({ diceCount: '12', useEdge: false, purpose: '' });
    setShadowrunDiceModalOpen(false);
  }

  function insertCharacterBlock(identity) {
    const attrs = [
      ['id', identity.id],
      ['type', identity.type],
      ['name', identity.name],
      ['subtitle', identity.subtitle],
      ['image', identity.image || '']
    ]
      .map(([name, attrValue]) => `${name}=${encodeBbcodeAttribute(attrValue)}`)
      .join(' ');
    const fallback = `${identity.name} speaks or acts here.`;
    wrapSelection(`[character ${attrs}]`, '[/character]', fallback);
  }

  function insertPostAsBlock() {
    if (!postIdentities.length) {
      window.alert('No character, NPC, or monster posting options are available for this campaign yet.');
      return;
    }
    const choices = postIdentities
      .map((identity, index) => `${index + 1}. ${identity.name} - ${identity.subtitle}`)
      .join('\n');
    const selection = window.prompt(`Post as which character/NPC?\n\n${choices}`, '1');
    if (!selection) return;
    const selectedIndex = Number.parseInt(selection, 10) - 1;
    const identity = postIdentities[selectedIndex];
    if (!identity) {
      window.alert('That character/NPC choice was not found.');
      return;
    }
    insertCharacterBlock(identity);
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
        <button type="button" onClick={insertCenteredImage}>Image Center</button>
        <button type="button" className="post-as-tool" onClick={insertPostAsBlock}>Post as</button>
        <button type="button" className="dice-tool" onClick={() => setDiceModalOpen(true)}>Dice Roll</button>
        <button type="button" className="dice-tool" onClick={() => setShadowrunDiceModalOpen(true)}>Shadowrun Roll</button>
      </div>
      {diceModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal dice-roll-modal" role="dialog" aria-modal="true" aria-label="Insert dice roll">
            <header>
              <div>
                <strong>Dice Roll</strong>
                <small>Add a purpose so the roll remains meaningful after edits.</small>
              </div>
              <button type="button" onClick={() => setDiceModalOpen(false)}>Cancel</button>
            </header>
            <div className="dice-roll-form">
              <label>
                Dice
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={diceDraft.diceCount}
                  onChange={(event) => setDiceDraft((current) => ({ ...current, diceCount: event.target.value }))}
                />
              </label>
              <label>
                Size
                <input
                  type="number"
                  min="2"
                  max="1000"
                  value={diceDraft.dieSize}
                  onChange={(event) => setDiceDraft((current) => ({ ...current, dieSize: event.target.value }))}
                />
              </label>
              <label>
                Bonus/Penalty
                <input
                  type="number"
                  min="-10000"
                  max="10000"
                  value={diceDraft.modifier}
                  onChange={(event) => setDiceDraft((current) => ({ ...current, modifier: event.target.value }))}
                />
              </label>
              <label className="dice-purpose-field">
                Roll is for
                <input
                  value={diceDraft.purpose}
                  onChange={(event) => setDiceDraft((current) => ({ ...current, purpose: event.target.value }))}
                  placeholder="Attack, lockpicking, perception..."
                  maxLength={160}
                />
              </label>
              <div className="button-row">
                <button type="button" onClick={insertDiceRoll}>Insert roll</button>
                <button type="button" onClick={() => setDiceModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </section>
        </div>
      )}
      {shadowrunDiceModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal dice-roll-modal" role="dialog" aria-modal="true" aria-label="Insert Shadowrun dice roll">
            <header>
              <div>
                <strong>Shadowrun Roll</strong>
                <small>Roll d6s, count hits, and optionally use Edge.</small>
              </div>
              <button type="button" onClick={() => setShadowrunDiceModalOpen(false)}>Cancel</button>
            </header>
            <div className="dice-roll-form shadowrun-dice-roll-form">
              <label>
                d6s
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={shadowrunDiceDraft.diceCount}
                  onChange={(event) => setShadowrunDiceDraft((current) => ({ ...current, diceCount: event.target.value }))}
                />
              </label>
              <label className="checkbox-row shadowrun-edge-field">
                <input
                  type="checkbox"
                  checked={shadowrunDiceDraft.useEdge}
                  onChange={(event) => setShadowrunDiceDraft((current) => ({ ...current, useEdge: event.target.checked }))}
                />
                Use Edge
              </label>
              <label className="dice-purpose-field">
                Roll is for
                <input
                  value={shadowrunDiceDraft.purpose}
                  onChange={(event) => setShadowrunDiceDraft((current) => ({ ...current, purpose: event.target.value }))}
                  placeholder="Sneaking, spellcasting, defense..."
                  maxLength={160}
                />
              </label>
              <div className="button-row">
                <button type="button" onClick={insertShadowrunDiceRoll}>Insert Shadowrun roll</button>
                <button type="button" onClick={() => setShadowrunDiceModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </section>
        </div>
      )}
      {!!postIdentities.length && (
        <div className="character-bbcode-tools" aria-label="Character BBCode blocks">
          <strong>Character/NPC block</strong>
          <div className="post-as-buttons">
            {postIdentities.map((identity) => (
              <button
                type="button"
                key={identity.id}
                onClick={() => insertCharacterBlock(identity)}
              >
                <span className={`post-as-thumb ${identity.type === 'npc' ? 'npc' : ''}`}>
                  {identity.image ? <img src={identity.image} alt="" /> : identity.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{identity.name}</strong>
                  <small>{identity.subtitle}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="dice-syntax-help">
        <strong>Dice syntax</strong>
        <span><code>[roll dice=2 size=6 bonus=3 for=Lockpicking]</code> rolls standard dice.</span>
        <span><code>[sr dice=12 edge=true for=Sneaking]</code> rolls Shadowrun d6s.</span>
        <span><code>/roll 2d6+3 for Lockpicking</code> rolls standard dice.</span>
        <span><code>/sr 12 edge for Sneaking</code> rolls Shadowrun d6s.</span>
        {!!postIdentities.length && <span>Use a character/NPC button to insert an in-character BBCode block inside the post.</span>}
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
            dangerouslySetInnerHTML={{ __html: renderBbcode(value, portraitRefreshKey) }}
          />
        ) : (
          <p>No preview yet.</p>
        )}
      </div>
    </div>
  );
}

function renderBbcode(input, portraitRefreshKey = 0) {
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
    .replace(/\[img=center\](https?:\/\/[^\s[]+?)\[\/img\]/gi, '<img class="bbcode-image-center" src="$1" alt="" loading="lazy" />')
    .replace(/\[img\](https?:\/\/[^\s[]+?)\[\/img\]/gi, '<img src="$1" alt="" loading="lazy" />');
  html = renderRollBbcode(html);
  html = renderCharacterBbcode(html, portraitRefreshKey);
  html = renderBbcodeLists(html);
  html = html
    .replace(/\r?\n/g, '<br />');
  return html;
}

function renderRollBbcode(html) {
  return html
    .replace(/\[roll\s+([^\]]+)\]/gi, (_match, attrText) => {
      const attrs = parseBbcodeAttributes(attrText);
      const diceExpression = String(attrs.dice || '').match(/^(\d{1,3})d(\d{1,4})$/i);
      const diceCount = diceExpression?.[1] || attrs.dice || attrs.count || attrs.amount || '1';
      const dieSize = diceExpression?.[2] || attrs.size || attrs.sides || attrs.die || '20';
      const modifier = attrs.bonus || attrs.modifier || attrs.mod || (attrs.penalty ? `-${attrs.penalty}` : '0');
      const purpose = attrs.for || attrs.reason || attrs.purpose || attrs.label || 'Dice roll';
      const modifierNumber = Number.parseInt(modifier, 10) || 0;
      const modifierText = modifierNumber ? `${modifierNumber > 0 ? '+' : ''}${modifierNumber}` : '';
      return `<span class="bbcode-roll-preview">${escapeHtml(purpose)}: ${escapeHtml(diceCount)}d${escapeHtml(dieSize)}${escapeHtml(modifierText)}</span>`;
    })
    .replace(/\[sr\s+([^\]]+)\]/gi, (_match, attrText) => {
      const attrs = parseBbcodeAttributes(attrText);
      const diceCount = attrs.dice || attrs.count || attrs.amount || attrs.pool || '12';
      const purpose = attrs.for || attrs.reason || attrs.purpose || attrs.label || 'Shadowrun roll';
      const useEdge = ['1', 'true', 'yes', 'y', 'edge'].includes(String(attrs.edge || '').toLowerCase());
      return `<span class="bbcode-roll-preview">${escapeHtml(purpose)}: ${escapeHtml(diceCount)}d6${useEdge ? ' with Edge' : ''}</span>`;
    });
}

function renderCharacterBbcode(html, portraitRefreshKey = 0) {
  return html.replace(/\[character\s+([^\]]+)\]([\s\S]*?)\[\/character\]/gi, (_match, attrText, content) => {
    const attrs = parseBbcodeAttributes(attrText);
    const name = attrs.name || 'Character';
    const typeClass = attrs.type === 'npc' ? ' npc' : '';
    const safeImage = sanitizeImageSource(attrs.image || '');
    const portraitSrc = cacheBustInternalPortrait(safeImage, portraitRefreshKey);
    const portrait = portraitSrc
      ? `<img src="${escapeHtml(portraitSrc)}" alt="" loading="lazy" />`
      : `<span>${escapeHtml(name.slice(0, 2).toUpperCase())}</span>`;
    return `<section class="character-post${typeClass}"><div class="character-post-content"><header><strong>${escapeHtml(name)}</strong></header><aside class="character-portrait">${portrait}</aside><div class="character-post-text">${content}</div></div></section>`;
  });
}

function cacheBustInternalPortrait(src, refreshKey = 0) {
  const value = String(src || '');
  if (!/^\/api\/campaigns\/[^/]+\/cast\/[^/]+\/portrait(?:[?#].*)?$/i.test(value)) return value;
  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}refresh=${encodeURIComponent(refreshKey || Date.now())}`;
}

function parseBbcodeAttributes(attrText) {
  const attrs = {};
  for (const match of String(attrText || '').matchAll(/([a-z]+)=([^\s\]]*)/gi)) {
    attrs[match[1].toLowerCase()] = decodeBbcodeAttribute(match[2]);
  }
  return attrs;
}

function encodeBbcodeAttribute(value) {
  return encodeURIComponent(String(value || ''));
}

function decodeBbcodeAttribute(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return '';
  }
}

function sanitizeImageSource(source) {
  const value = String(source || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  if (value.startsWith('/')) return value;
  return '';
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
