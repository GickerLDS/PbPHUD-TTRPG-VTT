import { useMemo, useState } from 'react';

const emptyDraft = {
  type: 'player',
  name: '',
  image: '',
  hp: 10,
  maxHp: 10,
  ownerId: ''
};

export function EntityPanel({
  entities,
  selectedEntityId,
  tiles,
  onAdd,
  onUpdate,
  onDelete,
  onSelect
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tileFilter, setTileFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const iconOptions = useMemo(() => {
    const needle = tileFilter.trim().toLowerCase();
    return tiles
      .filter((tile) => isCharacterTile(tile))
      .filter((tile) => {
        const haystack = `${tile.code} ${tile.label || ''} ${tile.category || ''}`.toLowerCase();
        return !needle || haystack.includes(needle);
      });
  }, [tileFilter, tiles]);

  const playerEntities = useMemo(() => {
    return entities.filter((entity) => entity.type === 'player');
  }, [entities]);

  function handleSubmit(event) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;

    const maxHp = Math.max(1, readPositiveNumber(draft.maxHp, 1));
    const hp = Math.min(maxHp, readPositiveNumber(draft.hp, 1));

    onAdd({
      ...draft,
      name,
      hp,
      maxHp
    });
    setDraft(emptyDraft);
  }

  function handleDraftFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setDraft((current) => ({ ...current, image: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  return (
    <section className="entity-panel">
      <div className="entity-header">
        <div>
          <strong>Entities</strong>
          <small>Saved with this map</small>
        </div>
        <span>{entities.length} total</span>
      </div>

      <form className="entity-form" onSubmit={handleSubmit}>
        <strong>Add Entity</strong>
        <select
          value={draft.type}
          onChange={(event) => {
            const type = event.target.value;
            setDraft({
              ...draft,
              type,
              ownerId: type === 'charmie' ? draft.ownerId : ''
            });
          }}
        >
          <option value="player">Player</option>
          <option value="mob">Mob</option>
          <option value="charmie">Charmie</option>
        </select>
        {draft.type === 'charmie' && (
          <select
            value={draft.ownerId}
            onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}
            aria-label="Charmie owner"
          >
            <option value="">No owner selected</option>
            {playerEntities.map((player) => (
              <option key={player.id} value={player.id}>{player.name}</option>
            ))}
          </select>
        )}
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="Name"
        />
        <div className="entity-hp-row">
          <input
            type="number"
            min="0"
            value={draft.hp}
            onChange={(event) => setDraft({ ...draft, hp: event.target.value })}
            aria-label="Current HP"
          />
          <span>/</span>
          <input
            type="number"
            min="1"
            value={draft.maxHp}
            onChange={(event) => setDraft({ ...draft, maxHp: event.target.value })}
            aria-label="Max HP"
          />
        </div>
        <button type="button" onClick={() => setPickerOpen(true)}>
          Choose character tile
        </button>
        <input
          value={draft.image}
          onChange={(event) => setDraft({ ...draft, image: event.target.value })}
          placeholder="Image URL"
        />
        <input type="file" accept="image/*" onChange={handleDraftFile} />
        <button type="submit">Add entity</button>
      </form>

      {pickerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPickerOpen(false)}>
          <div
            className="tile-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose character tile"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="tile-picker-header">
              <strong>Choose Character Tile</strong>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label="Close tile picker">
                Close
              </button>
            </div>
            <input
              value={tileFilter}
              onChange={(event) => setTileFilter(event.target.value)}
              placeholder="Filter people, creatures, mobs..."
              aria-label="Filter character tiles"
            />
            <div className="character-tile-grid">
              {iconOptions.map((tile) => (
                <button
                  key={`${tile.category}/${tile.filename}`}
                  type="button"
                  className={draft.image === tile.url ? 'selected' : ''}
                  title={`${tile.label || tile.code} (${tile.code})`}
                  onClick={() => {
                    setDraft({ ...draft, image: tile.url });
                    setPickerOpen(false);
                  }}
                >
                  <img src={tile.url} alt="" loading="lazy" />
                  <span>{tile.label || tile.code}</span>
                </button>
              ))}
              {!iconOptions.length && (
                <p className="tile-picker-empty">No character tiles match that filter.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="entity-list">
        <strong>Saved Entities</strong>
        {entities.map((entity) => (
          <EntityRow
            key={entity.id}
            entity={entity}
            selected={entity.id === selectedEntityId}
            onSelect={() => onSelect(entity.id)}
            onUpdate={(patch) => onUpdate(entity.id, patch)}
            onDelete={() => setPendingDelete(entity)}
            playerEntities={playerEntities}
          />
        ))}
      </div>

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPendingDelete(null)}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm entity removal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <strong>Delete {pendingDelete.name}?</strong>
            <p>
              This removes the saved entity from this map's entity list. It is not just erasing or clearing
              a placement square.
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  onDelete(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                Delete entity
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EntityRow({ entity, selected, onSelect, onUpdate, onDelete, playerEntities }) {
  const owner = playerEntities.find((player) => player.id === entity.ownerId);

  return (
    <div className={`entity-row ${selected ? 'selected' : ''}`}>
      <button type="button" className="entity-main" onClick={onSelect}>
        <EntityThumb entity={entity} />
        <span>
          <strong>{entity.name}</strong>
          <small>
            {entityTypeLabel(entity.type)}
            {entity.type === 'charmie' ? ` of ${owner?.name || 'unassigned'}` : ''}
            {entity.x && entity.y ? ` at ${entity.x},${entity.y}` : ' unplaced'}
          </small>
        </span>
      </button>
      {entity.type === 'charmie' && (
        <select
          value={entity.ownerId || ''}
          onChange={(event) => onUpdate({ ownerId: event.target.value || null })}
          aria-label={`${entity.name} owner`}
        >
          <option value="">No owner selected</option>
          {playerEntities.map((player) => (
            <option key={player.id} value={player.id}>{player.name}</option>
          ))}
        </select>
      )}
      <div className="entity-row-controls">
        <input
          type="number"
          min="0"
          value={entity.hp}
          onChange={(event) => onUpdate({ hp: readPositiveNumber(event.target.value, 0) })}
          aria-label={`${entity.name} current HP`}
        />
        <span>/</span>
        <input
          type="number"
          min="1"
          value={entity.maxHp}
          onChange={(event) => onUpdate({ maxHp: readPositiveNumber(event.target.value, 1) })}
          aria-label={`${entity.name} max HP`}
        />
        <button type="button" onClick={onSelect}>Place</button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function EntityThumb({ entity }) {
  if (entity.image) {
    return <img src={entity.image} alt="" />;
  }

  return <span className="entity-fallback">{entity.name.slice(0, 2).toUpperCase()}</span>;
}

function readPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function entityTypeLabel(type) {
  if (type === 'mob') return 'Mob';
  if (type === 'charmie') return 'Charmie';
  return 'Player';
}

function isCharacterTile(tile) {
  const category = String(tile?.category || '').toLowerCase();
  const label = String(tile?.label || '').toLowerCase();

  return (
    category.startsWith('people/') ||
    category.startsWith('creatures/') ||
    label.includes('character') ||
    label.includes('creature') ||
    label.includes('figure') ||
    label.includes('mob') ||
    label.includes('npc')
  );
}
