import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { userPublicId } from '../auth.js';
import { validate } from '../validation.js';

export const publicForumsRouter = express.Router();

const threadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(20000)
});

const postSchema = z.object({
  body: z.string().trim().min(1).max(20000)
});

const stickySchema = z.object({
  sticky: z.boolean()
});

publicForumsRouter.get('/sections', async (_req, res, next) => {
  try {
    const sections = await loadSections();
    res.json({ sections });
  } catch (error) {
    next(error);
  }
});

publicForumsRouter.get('/sections/:sectionSlug/threads', async (req, res, next) => {
  try {
    const section = await loadSectionBySlug(req.params.sectionSlug);
    if (!section) {
      res.status(404).json({ error: 'Forum section not found' });
      return;
    }

    const threads = await loadSectionThreads(section.id);
    res.json({ section, threads });
  } catch (error) {
    next(error);
  }
});

publicForumsRouter.post('/sections/:sectionSlug/threads', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required to post' });
      return;
    }

    const body = validate(threadSchema, req.body);
    const section = await loadSectionBySlug(req.params.sectionSlug);
    if (!section) {
      res.status(404).json({ error: 'Forum section not found' });
      return;
    }

    const viewerUserId = userPublicId(req.user);
    const result = await transaction(async (connection) => {
      const threadResult = await connection.query(
        `INSERT INTO public_forum_threads (section_id, title, created_by_user_id)
         VALUES (?, ?, ?)`,
        [section.id, body.title, viewerUserId]
      );
      await connection.query(
        `INSERT INTO public_forum_posts (thread_id, author_user_id, body_bbcode)
         VALUES (?, ?, ?)`,
        [threadResult.insertId, viewerUserId, body.body]
      );
      return threadResult;
    });

    res.status(201).json({ thread: await loadPublicThread(result.insertId, req.user) });
  } catch (error) {
    next(error);
  }
});

publicForumsRouter.get('/threads/:threadId', async (req, res, next) => {
  try {
    const thread = await loadPublicThread(req.params.threadId, req.user);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }
    res.json({ thread });
  } catch (error) {
    next(error);
  }
});

publicForumsRouter.post('/threads/:threadId/posts', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required to post' });
      return;
    }

    const body = validate(postSchema, req.body);
    const thread = await loadPublicThread(req.params.threadId, req.user);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    await query(
      `INSERT INTO public_forum_posts (thread_id, author_user_id, body_bbcode)
       VALUES (?, ?, ?)`,
      [thread.id, userPublicId(req.user), body.body]
    );
    res.status(201).json({ thread: await loadPublicThread(thread.id, req.user) });
  } catch (error) {
    next(error);
  }
});

publicForumsRouter.patch('/threads/:threadId/sticky', async (req, res, next) => {
  try {
    if (!isForumStaff(req.user)) {
      res.status(req.user ? 403 : 401).json({ error: req.user ? 'Moderator access required' : 'Sign in required' });
      return;
    }

    const body = validate(stickySchema, req.body);
    const thread = await loadPublicThread(req.params.threadId, req.user);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }

    await query(`UPDATE public_forum_threads SET sticky = ? WHERE id = ?`, [body.sticky, thread.id]);
    res.json({ thread: await loadPublicThread(thread.id, req.user) });
  } catch (error) {
    next(error);
  }
});

publicForumsRouter.patch('/threads/:threadId/posts/:postId', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }

    const body = validate(postSchema, req.body);
    const thread = await loadPublicThread(req.params.threadId, req.user);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }
    const post = thread.posts.find((item) => item.id === Number(req.params.postId));
    if (!post) {
      res.status(404).json({ error: 'Forum post not found' });
      return;
    }
    if (!post.canEdit || post.deleted) {
      res.status(403).json({ error: 'You cannot edit this post' });
      return;
    }

    await query(
      `UPDATE public_forum_posts
       SET body_bbcode = ?, edited_at = CURRENT_TIMESTAMP
       WHERE id = ? AND thread_id = ?`,
      [body.body, post.id, thread.id]
    );
    res.json({ thread: await loadPublicThread(thread.id, req.user) });
  } catch (error) {
    next(error);
  }
});

publicForumsRouter.delete('/threads/:threadId/posts/:postId', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }

    const thread = await loadPublicThread(req.params.threadId, req.user);
    if (!thread) {
      res.status(404).json({ error: 'Forum thread not found' });
      return;
    }
    const post = thread.posts.find((item) => item.id === Number(req.params.postId));
    if (!post) {
      res.status(404).json({ error: 'Forum post not found' });
      return;
    }
    if (!post.canDelete || post.deleted) {
      res.status(403).json({ error: 'You cannot delete this post' });
      return;
    }

    await query(
      `UPDATE public_forum_posts
       SET body_bbcode = '', deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), edited_at = CURRENT_TIMESTAMP
       WHERE id = ? AND thread_id = ?`,
      [post.id, thread.id]
    );
    res.json({ thread: await loadPublicThread(thread.id, req.user) });
  } catch (error) {
    next(error);
  }
});

async function loadSections() {
  const rows = await query(
    `SELECT
       section.id,
       section.slug,
       section.title,
       section.description,
       COUNT(DISTINCT thread.id) AS threadCount,
       COUNT(post.id) AS postCount,
       MAX(post.created_at) AS latestPostAt
     FROM public_forum_sections section
     LEFT JOIN public_forum_threads thread ON thread.section_id = section.id
     LEFT JOIN public_forum_posts post ON post.thread_id = thread.id
     GROUP BY section.id, section.slug, section.title, section.description, section.sort_order
     ORDER BY section.sort_order, section.title`
  );
  return rows.map(formatSection);
}

async function loadSectionBySlug(slug) {
  const rows = await query(
    `SELECT
       section.id,
       section.slug,
       section.title,
       section.description,
       COUNT(DISTINCT thread.id) AS threadCount,
       COUNT(post.id) AS postCount,
       MAX(post.created_at) AS latestPostAt
     FROM public_forum_sections section
     LEFT JOIN public_forum_threads thread ON thread.section_id = section.id
     LEFT JOIN public_forum_posts post ON post.thread_id = thread.id
     WHERE section.slug = ?
     GROUP BY section.id, section.slug, section.title, section.description, section.sort_order
     LIMIT 1`,
    [slug]
  );
  return rows[0] ? formatSection(rows[0]) : null;
}

async function loadSectionThreads(sectionId) {
  const rows = await query(
    `SELECT
       thread.id,
       thread.title,
       thread.sticky,
       thread.created_by_user_id AS createdByUserId,
       creator.display_name AS createdByDisplayName,
       creator.email AS createdByEmail,
       creator.community_role AS createdByCommunityRole,
       creator.profile_image_url AS createdByProfileImageUrl,
       creator.use_gravatar AS createdByUseGravatar,
       creator.updated_at AS createdByUpdatedAt,
       creator_post_counts.postCount AS createdByPostCount,
       thread.created_at AS createdAt,
       thread.updated_at AS updatedAt,
       COUNT(post.id) AS postCount,
       MAX(post.created_at) AS latestPostAt
     FROM public_forum_threads thread
     LEFT JOIN users creator
       ON thread.created_by_user_id = CONCAT('user:', creator.id)
     LEFT JOIN (
       SELECT author_user_id, COUNT(*) AS postCount
       FROM (
         SELECT author_user_id FROM campaign_forum_posts
         UNION ALL
         SELECT author_user_id FROM public_forum_posts
       ) all_posts
       GROUP BY author_user_id
     ) creator_post_counts ON creator_post_counts.author_user_id = thread.created_by_user_id
     LEFT JOIN public_forum_posts post ON post.thread_id = thread.id
     WHERE thread.section_id = ?
     GROUP BY
       thread.id,
       thread.title,
       thread.sticky,
       thread.created_by_user_id,
       creator.display_name,
       creator.email,
       creator.community_role,
       creator.profile_image_url,
       creator.use_gravatar,
       creator.updated_at,
       creator_post_counts.postCount,
       thread.created_at,
       thread.updated_at
     ORDER BY thread.sticky DESC, COALESCE(MAX(post.created_at), thread.updated_at) DESC, thread.created_at DESC`,
    [sectionId]
  );
  return rows.map(formatThreadSummary);
}

async function loadPublicThread(threadId, viewerUser = null) {
  const threadRows = await query(
    `SELECT
       thread.id,
       thread.section_id AS sectionId,
       section.slug AS sectionSlug,
       section.title AS sectionTitle,
       thread.title,
       thread.sticky,
       thread.created_by_user_id AS createdByUserId,
       creator.display_name AS createdByDisplayName,
       creator.email AS createdByEmail,
       creator.community_role AS createdByCommunityRole,
       creator.profile_image_url AS createdByProfileImageUrl,
       creator.use_gravatar AS createdByUseGravatar,
       creator.updated_at AS createdByUpdatedAt,
       creator_post_counts.postCount AS createdByPostCount,
       thread.created_at AS createdAt,
       thread.updated_at AS updatedAt
     FROM public_forum_threads thread
     INNER JOIN public_forum_sections section ON section.id = thread.section_id
     LEFT JOIN users creator
       ON thread.created_by_user_id = CONCAT('user:', creator.id)
     LEFT JOIN (
       SELECT author_user_id, COUNT(*) AS postCount
       FROM (
         SELECT author_user_id FROM campaign_forum_posts
         UNION ALL
         SELECT author_user_id FROM public_forum_posts
       ) all_posts
       GROUP BY author_user_id
     ) creator_post_counts ON creator_post_counts.author_user_id = thread.created_by_user_id
     WHERE thread.id = ?
     LIMIT 1`,
    [threadId]
  );
  const thread = threadRows[0];
  if (!thread) return null;

  const postRows = await query(
    `SELECT
       post.id,
       post.author_user_id AS authorUserId,
       author.display_name AS authorDisplayName,
       author.email AS authorEmail,
       author.community_role AS authorCommunityRole,
       author.profile_image_url AS authorProfileImageUrl,
       author.use_gravatar AS authorUseGravatar,
       author.updated_at AS authorUpdatedAt,
       author_post_counts.postCount AS authorPostCount,
       post.body_bbcode AS body,
       post.deleted_at AS deletedAt,
       post.edited_at AS editedAt,
       post.created_at AS createdAt,
       post.updated_at AS updatedAt
     FROM public_forum_posts post
     LEFT JOIN users author
       ON post.author_user_id = CONCAT('user:', author.id)
     LEFT JOIN (
       SELECT author_user_id, COUNT(*) AS postCount
       FROM (
         SELECT author_user_id FROM campaign_forum_posts
         UNION ALL
         SELECT author_user_id FROM public_forum_posts
       ) all_posts
       GROUP BY author_user_id
     ) author_post_counts ON author_post_counts.author_user_id = post.author_user_id
     WHERE post.thread_id = ?
     ORDER BY post.created_at, post.id`,
    [thread.id]
  );

  return {
    ...formatThreadSummary({
      ...thread,
      postCount: postRows.length,
      latestPostAt: postRows.at(-1)?.createdAt || thread.updatedAt
    }),
    sectionId: Number(thread.sectionId),
    sectionSlug: thread.sectionSlug,
    sectionTitle: thread.sectionTitle,
    canModerate: isForumStaff(viewerUser),
    posts: postRows.map((post) => formatPost(post, viewerUser))
  };
}

function formatPost(post, viewerUser) {
  const formatted = {
    id: Number(post.id),
    authorUserId: post.authorUserId,
    authorDisplayName: post.authorDisplayName || post.authorUserId,
    authorCommunityRole: normalizeCommunityRole(post.authorCommunityRole),
    authorRoleLabel: communityRoleLabel(post.authorCommunityRole),
    authorAvatarUrl: userAvatarUrl({
      email: post.authorEmail,
      profileImageUrl: post.authorProfileImageUrl,
      useGravatar: post.authorUseGravatar,
      updatedAt: post.authorUpdatedAt
    }),
    authorPostCount: Number(post.authorPostCount || 0),
    body: post.body,
    deleted: Boolean(post.deletedAt),
    deletedAt: post.deletedAt,
    editedAt: post.editedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    rolls: []
  };

  return {
    ...formatted,
    canEdit: canEditPost(viewerUser, formatted),
    canDelete: canDeletePost(viewerUser, formatted)
  };
}

function formatSection(row) {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    threadCount: Number(row.threadCount || 0),
    postCount: Number(row.postCount || 0),
    latestPostAt: row.latestPostAt || null
  };
}

function formatThreadSummary(row) {
  return {
    id: Number(row.id),
    title: row.title,
    sticky: Boolean(row.sticky),
    createdByUserId: row.createdByUserId,
    createdByDisplayName: row.createdByDisplayName || row.createdByUserId,
    createdByCommunityRole: normalizeCommunityRole(row.createdByCommunityRole),
    createdByRoleLabel: communityRoleLabel(row.createdByCommunityRole),
    createdByAvatarUrl: userAvatarUrl({
      email: row.createdByEmail,
      profileImageUrl: row.createdByProfileImageUrl,
      useGravatar: row.createdByUseGravatar,
      updatedAt: row.createdByUpdatedAt
    }),
    createdByPostCount: Number(row.createdByPostCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    postCount: Number(row.postCount || 0),
    latestPostAt: row.latestPostAt || row.updatedAt
  };
}

function normalizeCommunityRole(role) {
  return ['admin', 'moderator', 'community_member'].includes(role) ? role : 'community_member';
}

function communityRoleLabel(role) {
  const normalized = normalizeCommunityRole(role);
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'moderator') return 'Moderator';
  return 'Community Member';
}

function isAdmin(user) {
  return normalizeCommunityRole(user?.community_role) === 'admin';
}

function isModerator(user) {
  return normalizeCommunityRole(user?.community_role) === 'moderator';
}

function isForumStaff(user) {
  return isAdmin(user) || isModerator(user);
}

function canEditPost(viewerUser, post) {
  if (!viewerUser) return false;
  if (isAdmin(viewerUser)) return true;
  return post.authorUserId === userPublicId(viewerUser);
}

function canDeletePost(viewerUser, post) {
  if (!viewerUser) return false;
  if (post.authorUserId === userPublicId(viewerUser)) return true;
  if (isAdmin(viewerUser)) return true;
  if (isModerator(viewerUser)) {
    return normalizeCommunityRole(post.authorCommunityRole) === 'community_member';
  }
  return false;
}

function userAvatarUrl({ email, profileImageUrl, useGravatar, updatedAt }) {
  if (useGravatar && email) {
    const hash = crypto.createHash('md5').update(String(email).trim().toLowerCase()).digest('hex');
    const version = updatedAt ? `&v=${encodeURIComponent(new Date(updatedAt).getTime() || String(updatedAt))}` : '';
    return `https://www.gravatar.com/avatar/${hash}?s=128&d=identicon${version}`;
  }
  return profileImageUrl || '';
}
