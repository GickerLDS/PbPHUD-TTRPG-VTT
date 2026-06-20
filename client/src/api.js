export async function listMaps() {
  const response = await fetch('/api/maps', { headers: viewerHeaders() });
  return parseResponse(response);
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
  const viewerUserId = getViewerUserId().trim();
  return viewerUserId ? { 'X-PBPHUD-Viewer-Id': viewerUserId } : {};
}
