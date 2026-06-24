export async function listMaps() {
  const response = await fetch('/api/maps', { headers: viewerHeaders() });
  return parseResponse(response);
}

export async function listCampaigns() {
  const response = await fetch('/api/campaigns', { headers: viewerHeaders() });
  return parseResponse(response);
}

export async function createCampaign(payload) {
  const response = await fetch('/api/campaigns', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function inviteCampaignMember(campaignId, userId) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ userId })
  });
  return parseResponse(response);
}

export async function listCampaignCast(campaignId) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/cast`, {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function createCampaignCast(campaignId, payload) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/cast`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function updateCampaignCast(campaignId, castId, payload) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/cast/${encodeURIComponent(castId)}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function deleteCampaignCast(campaignId, castId) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/cast/${encodeURIComponent(castId)}`, {
    method: 'DELETE',
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function createCampaignMap(campaignId, payload) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/maps`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function listForumThreads(campaignId, mapId = null) {
  const params = mapId ? `?mapId=${encodeURIComponent(mapId)}` : '';
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads${params}`, {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function createForumThread(campaignId, payload) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function getForumThread(campaignId, threadId) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}`,
    { headers: viewerHeaders() }
  );
  return parseResponse(response);
}

export async function markForumThreadRead(campaignId, threadId) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/read`,
    {
      method: 'POST',
      headers: viewerHeaders()
    }
  );
  return parseResponse(response);
}

export async function subscribeForumThread(campaignId, threadId) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/subscription`,
    {
      method: 'POST',
      headers: viewerHeaders()
    }
  );
  return parseResponse(response);
}

export async function unsubscribeForumThread(campaignId, threadId) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/subscription`,
    {
      method: 'DELETE',
      headers: viewerHeaders()
    }
  );
  return parseResponse(response);
}

export async function sendForumThreadTestNotification(campaignId, threadId) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/test-notification`,
    {
      method: 'POST',
      headers: viewerHeaders()
    }
  );
  return parseResponse(response);
}

export async function listForumPostIdentities(campaignId) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/forum/post-identities`, {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function createForumPost(campaignId, threadId, body) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/posts`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ body })
    }
  );
  return parseResponse(response);
}

export async function updateForumPost(campaignId, threadId, postId, body) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/posts/${encodeURIComponent(postId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ body })
    }
  );
  return parseResponse(response);
}

export async function deleteForumPost(campaignId, threadId, postId) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/posts/${encodeURIComponent(postId)}`,
    {
      method: 'DELETE',
      headers: viewerHeaders()
    }
  );
  return parseResponse(response);
}

export async function assignForumThreadMap(campaignId, threadId, mapId) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/map`,
    {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ mapId })
    }
  );
  return parseResponse(response);
}

export async function setForumThreadVisibility(campaignId, threadId, visibilityLevel) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/forum/threads/${encodeURIComponent(threadId)}/visibility`,
    {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ visibilityLevel })
    }
  );
  return parseResponse(response);
}

export async function listPublicForumSections() {
  const response = await fetch('/api/public-forums/sections', {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function listPublicForumThreads(sectionSlug) {
  const response = await fetch(`/api/public-forums/sections/${encodeURIComponent(sectionSlug)}/threads`, {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function createPublicForumThread(sectionSlug, payload) {
  const response = await fetch(`/api/public-forums/sections/${encodeURIComponent(sectionSlug)}/threads`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function getPublicForumThread(threadId) {
  const response = await fetch(`/api/public-forums/threads/${encodeURIComponent(threadId)}`, {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function createPublicForumPost(threadId, body) {
  const response = await fetch(`/api/public-forums/threads/${encodeURIComponent(threadId)}/posts`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ body })
  });
  return parseResponse(response);
}

export async function updatePublicForumPost(threadId, postId, body) {
  const response = await fetch(
    `/api/public-forums/threads/${encodeURIComponent(threadId)}/posts/${encodeURIComponent(postId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ body })
    }
  );
  return parseResponse(response);
}

export async function deletePublicForumPost(threadId, postId) {
  const response = await fetch(
    `/api/public-forums/threads/${encodeURIComponent(threadId)}/posts/${encodeURIComponent(postId)}`,
    {
      method: 'DELETE',
      headers: viewerHeaders()
    }
  );
  return parseResponse(response);
}

export async function setPublicForumThreadSticky(threadId, sticky) {
  const response = await fetch(`/api/public-forums/threads/${encodeURIComponent(threadId)}/sticky`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify({ sticky })
  });
  return parseResponse(response);
}

export async function listAdminUsers() {
  const response = await fetch('/api/admin/users', {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function getDemoAssignment() {
  const response = await fetch('/api/admin/demo-assignment', {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function getAdminDemoAssignmentOptions() {
  const response = await fetch('/api/admin/demo-assignment/options', {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function updateDemoAssignment(payload) {
  const response = await fetch('/api/admin/demo-assignment', {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function updateAdminUserRole(userId, communityRole) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify({ communityRole })
  });
  return parseResponse(response);
}

export async function sendContactMessage(payload) {
  const response = await fetch('/api/contact', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function getAuthConfig() {
  const response = await fetch('/api/auth/config');
  return parseResponse(response);
}

export async function getCurrentUser() {
  const response = await fetch('/api/auth/me', { headers: authHeaders() });
  return parseResponse(response);
}

export async function updateAccountProfile(payload) {
  const response = await fetch('/api/auth/profile', {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function registerAccount(payload) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function loginAccount(payload) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await parseResponse(response);
  setAuthToken(data.token);
  return data;
}

export async function resendVerificationEmail(email) {
  const response = await fetch('/api/auth/resend-verification', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email })
  });
  return parseResponse(response);
}

export async function logoutAccount() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders()
  });
  clearAuthToken();
  return parseResponse(response);
}

export async function verifyEmail(token) {
  const response = await fetch('/api/auth/verify-email', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ token })
  });
  const data = await parseResponse(response);
  setAuthToken(data.token);
  return data;
}

export async function createMap(payload) {
  const response = await fetch('/api/maps', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function getMap(groupName, mapName) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}`, {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function getMapById(mapId) {
  const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}`, {
    headers: viewerHeaders()
  });
  return parseResponse(response);
}

export async function setMapVisibility(mapId, visibilityLevel) {
  const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}/visibility`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify({ visibilityLevel })
  });
  return parseResponse(response);
}

export async function inviteMapUser(mapId, userId) {
  const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}/campaign-invites`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ userId })
  });
  return parseResponse(response);
}

export async function patchTile(groupName, mapName, payload) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}/tiles`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function patchEntity(groupName, mapName, entityId, payload) {
  const response = await fetch(
    `/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}/entities/${encodeURIComponent(entityId)}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(payload)
    }
  );
  return parseResponse(response);
}

export async function createEntity(groupName, mapName, payload) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}/entities`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function shareMap(groupName, mapName, userId) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}/shares`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ userId })
  });
  return parseResponse(response);
}

export async function unshareMap(groupName, mapName, userId) {
  const response = await fetch(
    `/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}/shares/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: viewerHeaders()
    }
  );
  return parseResponse(response);
}

export async function saveMap(groupName, mapName, payload) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function listTileAssets() {
  const response = await fetch('/api/assets/tiles');
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

export function setViewerUserId(userId) {
  if (typeof window === 'undefined') return;
  const value = String(userId || '').trim();
  if (value) {
    window.localStorage.setItem('pbphud-viewer-user-id', value);
  } else {
    window.localStorage.removeItem('pbphud-viewer-user-id');
  }
}

export function getViewerUserId() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('viewerUserId') || window.localStorage.getItem('pbphud-viewer-user-id') || '';
}

function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
    ...viewerHeaders()
  };
}

function viewerHeaders() {
  const token = getAuthToken();
  if (token) return { Authorization: `Bearer ${token}` };
  const viewerUserId = getViewerUserId().trim();
  return viewerUserId ? { 'X-PBPHUD-Viewer-Id': viewerUserId } : {};
}

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getAuthToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('pbphud-auth-token') || '';
}

export function setAuthToken(token) {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem('pbphud-auth-token', token);
  } else {
    clearAuthToken();
  }
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('pbphud-auth-token');
}
