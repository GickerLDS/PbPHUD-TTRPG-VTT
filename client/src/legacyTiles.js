export function tileCodeToUrl(tileCode) {
  const suffix = tileCode?.slice(-1)?.toLowerCase();
  const extension = suffix === 'p' ? 'png' : suffix === 'j' ? 'jpg' : 'gif';
  return `/tiles/${encodeURIComponent(`${tileCode}.${extension}`)}`;
}

export function normalizeTile(tile) {
  return {
    ...tile,
    layer: tile.layer || tile.tileCode?.[0] || 'a',
    url: tile.url || tileCodeToUrl(tile.tileCode)
  };
}

export function layerRank(layer) {
  const order = 'abdefghijklmnopqrsuvwxytc1';
  const index = order.indexOf(layer);
  return index === -1 ? 999 : index;
}
