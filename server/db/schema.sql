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
  visibility_level VARCHAR(20) NOT NULL DEFAULT 'hidden',
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
ALTER TABLE maps ADD COLUMN IF NOT EXISTS visibility_level VARCHAR(20) NOT NULL DEFAULT 'hidden' AFTER player_visible;
ALTER TABLE maps ADD INDEX IF NOT EXISTS idx_maps_owner (owner_user_id);
ALTER TABLE maps ADD INDEX IF NOT EXISTS idx_maps_campaign (campaign_id);
UPDATE maps SET grid_width = grid_size WHERE grid_width IS NULL;
UPDATE maps SET grid_height = grid_size WHERE grid_height IS NULL;
UPDATE maps SET visibility_level = 'campaign' WHERE visibility_level = 'hidden' AND player_visible = TRUE;

CREATE TABLE IF NOT EXISTS campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  owner_user_id VARCHAR(191) NOT NULL,
  game_description LONGTEXT NOT NULL,
  recruitment_info LONGTEXT NOT NULL,
  recruitment_listed BOOLEAN NOT NULL DEFAULT FALSE,
  allow_lurkers BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaigns_owner (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS game_description LONGTEXT NOT NULL AFTER owner_user_id;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recruitment_info LONGTEXT NOT NULL AFTER game_description;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recruitment_listed BOOLEAN NOT NULL DEFAULT FALSE AFTER recruitment_info;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS allow_lurkers BOOLEAN NOT NULL DEFAULT FALSE AFTER recruitment_listed;
ALTER TABLE campaigns ADD INDEX IF NOT EXISTS idx_campaigns_recruitment (recruitment_listed, allow_lurkers);

CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  member_role VARCHAR(20) NOT NULL DEFAULT 'player',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, user_id),
  KEY idx_campaign_members_user (user_id),
  CONSTRAINT fk_campaign_members_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaign_members ADD COLUMN IF NOT EXISTS member_role VARCHAR(20) NOT NULL DEFAULT 'player' AFTER user_id;

CREATE TABLE IF NOT EXISTS campaign_ownership_transfer_invites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  current_owner_user_id VARCHAR(191) NOT NULL,
  invited_owner_user_id VARCHAR(191) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  responded_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_campaign_ownership_transfer_token (token_hash),
  KEY idx_campaign_ownership_transfer_campaign (campaign_id, status),
  KEY idx_campaign_ownership_transfer_invited (invited_owner_user_id, status),
  CONSTRAINT fk_campaign_ownership_transfer_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_cast (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  cast_type VARCHAR(20) NOT NULL,
  owner_user_id VARCHAR(191) NULL,
  name VARCHAR(160) NOT NULL,
  portrait_url LONGTEXT NULL,
  public_description LONGTEXT NOT NULL,
  gm_notes LONGTEXT NOT NULL,
  combat_stats_public LONGTEXT NOT NULL,
  combat_stats_gm LONGTEXT NOT NULL,
  status_effects_public LONGTEXT NOT NULL,
  status_effects_gm LONGTEXT NOT NULL,
  current_health VARCHAR(80) NOT NULL DEFAULT '',
  max_health VARCHAR(80) NOT NULL DEFAULT '',
  visible_to_players BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign_cast_campaign (campaign_id, cast_type),
  KEY idx_campaign_cast_owner (owner_user_id),
  CONSTRAINT fk_campaign_cast_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS portrait_url LONGTEXT NULL AFTER name;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS public_description LONGTEXT NOT NULL AFTER portrait_url;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS gm_notes LONGTEXT NOT NULL AFTER public_description;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS combat_stats_public LONGTEXT NOT NULL AFTER gm_notes;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS combat_stats_gm LONGTEXT NOT NULL AFTER combat_stats_public;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS status_effects_public LONGTEXT NOT NULL AFTER combat_stats_gm;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS status_effects_gm LONGTEXT NOT NULL AFTER status_effects_public;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS current_health VARCHAR(80) NOT NULL DEFAULT '' AFTER status_effects_gm;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS max_health VARCHAR(80) NOT NULL DEFAULT '' AFTER current_health;
ALTER TABLE campaign_cast ADD COLUMN IF NOT EXISTS visible_to_players BOOLEAN NOT NULL DEFAULT TRUE AFTER max_health;

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

CREATE TABLE IF NOT EXISTS campaign_forum_threads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  map_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  visibility_level VARCHAR(20) NOT NULL DEFAULT 'campaign',
  created_by_user_id VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign_forum_threads_campaign (campaign_id),
  KEY idx_campaign_forum_threads_map (map_id),
  CONSTRAINT fk_campaign_forum_threads_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_campaign_forum_threads_map
    FOREIGN KEY (map_id) REFERENCES maps (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaign_forum_threads ADD COLUMN IF NOT EXISTS visibility_level VARCHAR(20) NOT NULL DEFAULT 'campaign' AFTER title;

CREATE TABLE IF NOT EXISTS campaign_forum_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id BIGINT UNSIGNED NOT NULL,
  author_user_id VARCHAR(191) NOT NULL,
  post_as_json LONGTEXT NULL,
  body_bbcode LONGTEXT NOT NULL,
  deleted_at TIMESTAMP NULL,
  edited_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign_forum_posts_thread (thread_id, created_at),
  CONSTRAINT fk_campaign_forum_posts_thread
    FOREIGN KEY (thread_id) REFERENCES campaign_forum_threads (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaign_forum_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL AFTER body_bbcode;
ALTER TABLE campaign_forum_posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL AFTER deleted_at;
ALTER TABLE campaign_forum_posts ADD COLUMN IF NOT EXISTS post_as_json LONGTEXT NULL AFTER author_user_id;

CREATE TABLE IF NOT EXISTS campaign_forum_post_rolls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  roll_index SMALLINT UNSIGNED NOT NULL,
  roll_type VARCHAR(32) NOT NULL,
  command_text VARCHAR(120) NOT NULL,
  result_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_campaign_forum_post_roll_order (post_id, roll_index),
  CONSTRAINT fk_campaign_forum_post_rolls_post
    FOREIGN KEY (post_id) REFERENCES campaign_forum_posts (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_forum_thread_reads (
  thread_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  last_read_post_id BIGINT UNSIGNED NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id),
  KEY idx_campaign_forum_thread_reads_user (user_id),
  CONSTRAINT fk_campaign_forum_thread_reads_thread
    FOREIGN KEY (thread_id) REFERENCES campaign_forum_threads (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_campaign_forum_thread_reads_post
    FOREIGN KEY (last_read_post_id) REFERENCES campaign_forum_posts (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_forum_thread_subscriptions (
  thread_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  notify_pending BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id),
  KEY idx_campaign_forum_thread_subscriptions_user (user_id),
  CONSTRAINT fk_campaign_forum_thread_subscriptions_thread
    FOREIGN KEY (thread_id) REFERENCES campaign_forum_threads (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaign_forum_thread_subscriptions ADD COLUMN IF NOT EXISTS notify_pending BOOLEAN NOT NULL DEFAULT FALSE AFTER user_id;

CREATE TABLE IF NOT EXISTS campaign_forum_notification_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  first_post_id BIGINT UNSIGNED NOT NULL,
  latest_post_id BIGINT UNSIGNED NOT NULL,
  post_count INT UNSIGNED NOT NULL DEFAULT 1,
  queued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_campaign_forum_notification_queue_thread_user (thread_id, user_id),
  KEY idx_campaign_forum_notification_queue_user (user_id),
  CONSTRAINT fk_campaign_forum_notification_queue_thread
    FOREIGN KEY (thread_id) REFERENCES campaign_forum_threads (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_campaign_forum_notification_queue_first_post
    FOREIGN KEY (first_post_id) REFERENCES campaign_forum_posts (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_campaign_forum_notification_queue_latest_post
    FOREIGN KEY (latest_post_id) REFERENCES campaign_forum_posts (id)
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

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(80) NOT NULL,
  setting_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
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
  profile_about LONGTEXT NULL,
  profile_pronouns VARCHAR(80) NOT NULL DEFAULT '',
  profile_timezone VARCHAR(80) NOT NULL DEFAULT '',
  profile_image_url LONGTEXT NULL,
  use_gravatar BOOLEAN NOT NULL DEFAULT FALSE,
  auto_subscribe_forum_threads BOOLEAN NOT NULL DEFAULT FALSE,
  community_role VARCHAR(32) NOT NULL DEFAULT 'community_member',
  email_verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_about LONGTEXT NULL AFTER password_hash;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pronouns VARCHAR(80) NOT NULL DEFAULT '' AFTER profile_about;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_timezone VARCHAR(80) NOT NULL DEFAULT '' AFTER profile_pronouns;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url LONGTEXT NULL AFTER profile_timezone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS use_gravatar BOOLEAN NOT NULL DEFAULT FALSE AFTER profile_image_url;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_subscribe_forum_threads BOOLEAN NOT NULL DEFAULT FALSE AFTER use_gravatar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS community_role VARCHAR(32) NOT NULL DEFAULT 'community_member' AFTER auto_subscribe_forum_threads;
UPDATE users
SET community_role = 'admin'
WHERE id = (
  SELECT id FROM (
    SELECT id
    FROM users
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE community_role = 'admin')
    ORDER BY id
    LIMIT 1
  ) first_admin
);

CREATE TABLE IF NOT EXISTS public_forum_sections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_public_forum_sections_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_forum_threads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  created_by_user_id VARCHAR(191) NOT NULL,
  sticky BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_public_forum_threads_section (section_id, updated_at),
  CONSTRAINT fk_public_forum_threads_section
    FOREIGN KEY (section_id) REFERENCES public_forum_sections (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE public_forum_threads ADD COLUMN IF NOT EXISTS sticky BOOLEAN NOT NULL DEFAULT FALSE AFTER created_by_user_id;

CREATE TABLE IF NOT EXISTS public_forum_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id BIGINT UNSIGNED NOT NULL,
  author_user_id VARCHAR(191) NOT NULL,
  body_bbcode LONGTEXT NOT NULL,
  deleted_at TIMESTAMP NULL,
  edited_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_public_forum_posts_thread (thread_id, created_at),
  CONSTRAINT fk_public_forum_posts_thread
    FOREIGN KEY (thread_id) REFERENCES public_forum_threads (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO public_forum_sections (slug, title, description, sort_order)
VALUES
  ('announcements', 'Announcements', 'News and updates from PBPHUD.', 10),
  ('general-discussion', 'General Discussion', 'Talk about play-by-post games, tables, and tools.', 20),
  ('game-recruitment', 'Game Recruitment', 'Find players, tables, and campaigns.', 30),
  ('help-and-support', 'Help and Support', 'Ask questions and get help using PBPHUD.', 40)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  sort_order = VALUES(sort_order);

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
