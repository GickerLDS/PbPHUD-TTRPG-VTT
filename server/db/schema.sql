CREATE TABLE IF NOT EXISTS maps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NULL,
  group_name VARCHAR(80) NOT NULL,
  map_name VARCHAR(120) NOT NULL,
  grid_size SMALLINT UNSIGNED NOT NULL DEFAULT 40,
  grid_width SMALLINT UNSIGNED NULL,
  grid_height SMALLINT UNSIGNED NULL,
  owner_user_id VARCHAR(191) NULL,
  player_visible BOOLEAN NOT NULL DEFAULT FALSE,
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
ALTER TABLE maps ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(191) NULL AFTER grid_height;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS campaign_id BIGINT UNSIGNED NULL AFTER id;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS player_visible BOOLEAN NOT NULL DEFAULT FALSE AFTER owner_user_id;
ALTER TABLE maps ADD INDEX IF NOT EXISTS idx_maps_owner (owner_user_id);
ALTER TABLE maps ADD INDEX IF NOT EXISTS idx_maps_campaign (campaign_id);
UPDATE maps SET grid_width = grid_size WHERE grid_width IS NULL;
UPDATE maps SET grid_height = grid_size WHERE grid_height IS NULL;

CREATE TABLE IF NOT EXISTS campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  owner_user_id VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaigns_owner (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, user_id),
  KEY idx_campaign_members_user (user_id),
  CONSTRAINT fk_campaign_members_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS map_campaign_invites (
  map_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (map_id, user_id),
  KEY idx_map_campaign_invites_user (user_id),
  CONSTRAINT fk_map_campaign_invites_map
    FOREIGN KEY (map_id) REFERENCES maps (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS map_shares (
  map_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (map_id, user_id),
  KEY idx_map_shares_user (user_id),
  CONSTRAINT fk_map_shares_map
    FOREIGN KEY (map_id) REFERENCES maps (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verification_tokens_hash (token_hash),
  KEY idx_email_verification_tokens_user (user_id),
  CONSTRAINT fk_email_verification_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_sessions_hash (token_hash),
  KEY idx_user_sessions_user (user_id),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
