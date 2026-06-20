export async function listMaps() {
  const response = await fetch('/api/maps');
  return parseResponse(response);
}

export async function createMap(payload) {
  const response = await fetch('/api/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function getMap(groupName, mapName) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}`);
  return parseResponse(response);
}

export async function patchTile(groupName, mapName, payload) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}/tiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function saveMap(groupName, mapName, payload) {
  const response = await fetch(`/api/maps/${encodeURIComponent(groupName)}/${encodeURIComponent(mapName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
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
