import { query } from './db.js';

export async function subscribeUserToAccessibleForumThreads(userPublicId) {
  if (!userPublicId) return 0;
  const result = await query(
    `INSERT INTO campaign_forum_thread_subscriptions (thread_id, user_id, notify_pending)
     SELECT thread.id, ?, FALSE
     FROM campaign_forum_threads thread
     INNER JOIN campaigns campaign ON campaign.id = thread.campaign_id
     LEFT JOIN campaign_members member
       ON member.campaign_id = campaign.id
      AND member.user_id = ?
     WHERE campaign.owner_user_id = ?
        OR member.user_id IS NOT NULL
     ON DUPLICATE KEY UPDATE updated_at = campaign_forum_thread_subscriptions.updated_at`,
    [userPublicId, userPublicId, userPublicId]
  );
  return Number(result.affectedRows || 0);
}

export async function subscribeUserToCampaignThreadsIfEnabled(campaignId, userPublicId) {
  if (!campaignId || !userPublicId) return 0;
  const userRows = await query(
    `SELECT id
     FROM users
     WHERE CONCAT('user:', id) = ?
       AND auto_subscribe_forum_threads = TRUE
     LIMIT 1`,
    [userPublicId]
  );
  if (!userRows.length) return 0;

  const result = await query(
    `INSERT INTO campaign_forum_thread_subscriptions (thread_id, user_id, notify_pending)
     SELECT id, ?, FALSE
     FROM campaign_forum_threads
     WHERE campaign_id = ?
     ON DUPLICATE KEY UPDATE updated_at = campaign_forum_thread_subscriptions.updated_at`,
    [userPublicId, campaignId]
  );
  return Number(result.affectedRows || 0);
}

export async function subscribeAutoSubscribersToForumThread(campaignId, threadId) {
  if (!campaignId || !threadId) return 0;
  const result = await query(
    `INSERT INTO campaign_forum_thread_subscriptions (thread_id, user_id, notify_pending)
     SELECT ?, CONCAT('user:', users.id), FALSE
     FROM users
     INNER JOIN campaigns campaign ON campaign.id = ?
     LEFT JOIN campaign_members member
       ON member.campaign_id = campaign.id
      AND member.user_id = CONCAT('user:', users.id)
     WHERE users.auto_subscribe_forum_threads = TRUE
       AND (
         campaign.owner_user_id = CONCAT('user:', users.id)
         OR member.user_id IS NOT NULL
       )
     ON DUPLICATE KEY UPDATE updated_at = campaign_forum_thread_subscriptions.updated_at`,
    [threadId, campaignId]
  );
  return Number(result.affectedRows || 0);
}
