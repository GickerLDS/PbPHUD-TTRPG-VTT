import { useMemo, useState } from 'react';

export function TilePalette({ tiles, selectedTile, onSelect, layerLabel }) {
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('all');

  const categories = useMemo(() => {
    return ['all', ...Array.from(new Set(tiles.map((tile) => tile.category || 'uncategorized'))).sort()];
  }, [tiles]);

  const visibleTiles = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return tiles
      .filter((tile) => category === 'all' || (tile.category || 'uncategorized') === category)
      .filter((tile) => {
        const haystack = `${tile.code} ${tile.label || ''} ${tile.category || ''}`.toLowerCase();
        return !needle || haystack.includes(needle);
      });
  }, [category, filter, tiles]);

  return (
    <aside className="palette">
      <div className="palette-header">
        <strong>{layerLabel ? `${layerLabel} Tiles` : 'Tiles'}</strong>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Tile category">
          {categories.map((item) => (
            <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>
          ))}
        </select>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter code or label"
          aria-label="Filter tile code"
        />
        <span className="tile-count">{visibleTiles.length} shown</span>
      </div>
      <div className="tile-grid">
        {visibleTiles.map((tile) => (
          <button
            key={`${tile.category}/${tile.filename}`}
            className={`tile-button ${selectedTile?.code === tile.code ? 'selected' : ''}`}
            onClick={() => onSelect(tile)}
            title={`${tile.label || tile.code} (${tile.code})`}
          >
            <img src={tile.url} alt="" loading="lazy" />
            <span>{tile.label || tile.code}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
