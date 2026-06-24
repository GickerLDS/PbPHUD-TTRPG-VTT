import nodemailer from 'nodemailer';
import { query, transaction } from './db.js';
import { config } from './env.js';

const DIGEST_INTERVAL_MS = 60 * 60 * 1000;
let digestTimer = null;
let digestRunning = false;

export async function enqueueForumThreadNotifications(campaignId, threadId, authorUserId, postId) {
  const rows = await query(
    `SELECT subscription.user_id AS userId
     FROM campaign_forum_thread_subscriptions subscription
     INNER JOIN campaign_forum_threads thread ON thread.id = subscription.thread_id
     WHERE subscription.thread_id = ?
       AND thread.campaign_id = ?
       AND subscription.user_id <> ?
       AND subscription.notify_pending = FALSE`,
    [threadId, campaignId, authorUserId]
  );
  if (!rows.length) return;

  for (const row of rows) {
    await query(
      `INSERT INTO campaign_forum_notification_queue (
         thread_id, user_id, first_post_id, latest_post_id, post_count
       )
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         latest_post_id = VALUES(latest_post_id),
         post_count = post_count + 1,
         updated_at = CURRENT_TIMESTAMP`,
      [threadId, row.userId, postId, postId]
    );
  }
}

export function startForumNotificationDigestScheduler() {
  if (digestTimer) return;
  digestTimer = setInterval(() => {
    flushForumNotificationDigests().catch((error) => {
      console.warn('Forum notification digest failed', error);
    });
  }, DIGEST_INTERVAL_MS);
  digestTimer.unref?.();
}

export async function flushForumNotificationDigests() {
  if (digestRunning) return { sent: 0, skipped: true };
  digestRunning = true;
  try {
    const rows = await query(
      `SELECT
         queue.id,
         queue.thread_id AS threadId,
         queue.user_id AS userId,
         queue.post_count AS postCount,
         users.email,
         users.display_name AS displayName,
         thread.title AS threadTitle,
         thread.campaign_id AS campaignId,
         campaigns.name AS campaignName
       FROM campaign_forum_notification_queue queue
       INNER JOIN users ON queue.user_id = CONCAT('user:', users.id)
       INNER JOIN campaign_forum_threads thread ON thread.id = queue.thread_id
       INNER JOIN campaigns ON campaigns.id = thread.campaign_id
       ORDER BY queue.user_id, campaigns.name, thread.title`
    );
    if (!rows.length) return { sent: 0, skipped: false };

    const rowsByUser = groupBy(rows, (row) => row.userId);
    const transporter = forumNotificationTransporter();
    let sent = 0;

    for (const [userId, userRows] of rowsByUser.entries()) {
      const first = userRows[0];
      await transporter.sendMail(buildDigestMessage(first, userRows));
      sent += 1;

      await transaction(async (connection) => {
        await connection.query(
          `UPDATE campaign_forum_thread_subscriptions
           SET notify_pending = TRUE
           WHERE user_id = ?
             AND thread_id IN (${userRows.map(() => '?').join(',')})`,
          [userId, ...userRows.map((row) => row.threadId)]
        );
        await connection.query(
          `DELETE FROM campaign_forum_notification_queue
           WHERE id IN (${userRows.map(() => '?').join(',')})`,
          userRows.map((row) => row.id)
        );
      });
    }

    return { sent, skipped: false };
  } finally {
    digestRunning = false;
  }
}

export async function sendForumThreadTestNotification({ campaignId, campaignName, threadTitle, toEmail, displayName }) {
  const threadUrl = `${config.clientOrigin}/campaigns/${encodeURIComponent(campaignId)}/forums`;
  const email = {
    from: config.email.from,
    to: toEmail,
    subject: `PBPHUD test notification for ${threadTitle}`,
    campaignName,
    threadTitle,
    threadUrl,
    transport: 'SMTP2GO',
    smtpHost: config.email.smtp.host
  };
  try {
    await forumNotificationTransporter().sendMail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      text: [
        `Hi ${displayName},`,
        '',
        `This is a test notification for "${threadTitle}" in ${campaignName}.`,
        '',
        `Open the campaign forums: ${threadUrl}`,
        '',
        `SMTP host: ${config.email.smtp.host}`
      ].join('\n'),
      html: `
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>This is a test notification for <strong>${escapeHtml(threadTitle)}</strong> in ${escapeHtml(campaignName)}.</p>
        <p><a href="${escapeHtml(threadUrl)}">Open the campaign forums</a></p>
        <p>SMTP host: <code>${escapeHtml(config.email.smtp.host)}</code></p>
      `
    });
    return { ...email, sent: true };
  } catch (error) {
    return {
      ...email,
      sent: false,
      error: {
        code: error.code || '',
        message: error.message || 'SMTP notification failed'
      }
    };
  }
}

function buildDigestMessage(user, rows) {
  const lines = rows.map((row) => {
    const url = `${config.clientOrigin}/campaigns/${encodeURIComponent(row.campaignId)}/forums`;
    return `- ${row.campaignName}: ${row.threadTitle} (${row.postCount} new ${row.postCount === 1 ? 'post' : 'posts'})\n  ${url}`;
  });
  const items = rows.map((row) => {
    const url = `${config.clientOrigin}/campaigns/${encodeURIComponent(row.campaignId)}/forums`;
    return `<li><strong>${escapeHtml(row.campaignName)}</strong>: ${escapeHtml(row.threadTitle)} (${row.postCount} new ${row.postCount === 1 ? 'post' : 'posts'})<br /><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`;
  });

  return {
    from: config.email.from,
    to: user.email,
    subject: 'PBPHUD forum notification digest',
    text: [
      `Hi ${user.displayName || user.email},`,
      '',
      'Here are your subscribed forum threads with new posts:',
      '',
      ...lines,
      '',
      'You will not receive another digest for these threads until you mark them read.'
    ].join('\n'),
    html: `
      <p>Hi ${escapeHtml(user.displayName || user.email)},</p>
      <p>Here are your subscribed forum threads with new posts:</p>
      <ul>${items.join('')}</ul>
      <p>You will not receive another digest for these threads until you mark them read.</p>
    `
  };
}

function forumNotificationTransporter() {
  return nodemailer.createTransport(config.email.smtp);
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
