CREATE TABLE IF NOT EXISTS maps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_name VARCHAR(80) NOT NULL,
  map_name VARCHAR(120) NOT NULL,
  grid_size SMALLINT UNSIGNED NOT NULL DEFAULT 40,
  grid_width SMALLINT UNSIGNED NULL,
  grid_height SMALLINT UNSIGNED NULL,
  legacy_map_data LONGTEXT NOT NULL,
  legacy_map_data2 LONGTEXT NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_maps_group_map (group_name, map_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vtt_campaigns (
  provider VARCHAR(80) NOT NULL,
  external_campaign_id VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(191) NOT NULL,
  owner_display_name VARCHAR(255) NOT NULL DEFAULT '',
  payload_json LONGTEXT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, external_campaign_id),
  KEY idx_vtt_campaigns_owner (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vtt_campaign_members (
  provider VARCHAR(80) NOT NULL,
  external_campaign_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  role VARCHAR(32) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, external_campaign_id, user_id),
  KEY idx_vtt_campaign_members_user (user_id),
  CONSTRAINT fk_vtt_campaign_members_campaign
    FOREIGN KEY (provider, external_campaign_id) REFERENCES vtt_campaigns (provider, external_campaign_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vtt_campaign_characters (
  provider VARCHAR(80) NOT NULL,
  external_campaign_id VARCHAR(191) NOT NULL,
  external_character_id VARCHAR(191) NOT NULL,
  owner_user_id VARCHAR(191) NOT NULL,
  owner_display_name VARCHAR(255) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  entity_json LONGTEXT NOT NULL,
  payload_json LONGTEXT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, external_campaign_id, external_character_id),
  KEY idx_vtt_campaign_characters_owner (owner_user_id),
  CONSTRAINT fk_vtt_campaign_characters_campaign
    FOREIGN KEY (provider, external_campaign_id) REFERENCES vtt_campaigns (provider, external_campaign_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE maps ADD COLUMN IF NOT EXISTS grid_width SMALLINT UNSIGNED NULL AFTER grid_size;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS grid_height SMALLINT UNSIGNED NULL AFTER grid_width;
UPDATE maps SET grid_width = grid_size WHERE grid_width IS NULL;
UPDATE maps SET grid_height = grid_size WHERE grid_height IS NULL;

CREATE TABLE IF NOT EXISTS map_settings (
  map_id BIGINT UNSIGNED NOT NULL,
  topic_id VARCHAR(64) NULL,
  tracker_url VARCHAR(2048) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (map_id),
  CONSTRAINT fk_map_settings_map
    FOREIGN KEY (map_id) REFERENCES maps (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS map_editor_state (
  map_id BIGINT UNSIGNED NOT NULL,
  cell_size SMALLINT UNSIGNED NOT NULL DEFAULT 50,
  background_json LONGTEXT NULL,
  drawings_json LONGTEXT NULL,
  entities_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (map_id),
  CONSTRAINT fk_map_editor_state_map
    FOREIGN KEY (map_id) REFERENCES maps (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tile_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tile_code VARCHAR(32) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tile_assets_code (tile_code),
  UNIQUE KEY uq_tile_assets_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
