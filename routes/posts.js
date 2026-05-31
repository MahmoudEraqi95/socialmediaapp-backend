// routes/posts.js
// Post CRUD + feed + offline sync — backed by PostgreSQL via Prisma

const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// --------------------------------------------------
// GET /posts → Paginated reverse-chronological feed
// Query params: ?cursor=<postId>&limit=<n>
// --------------------------------------------------
router.get('/', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const cursor = req.query.cursor; // UUID of last post from previous page

    const queryOptions = {
      take: limit + 1, // Fetch one extra to determine if there's a next page
      where: { deleted: false },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    };

    if (cursor) {
      queryOptions.skip = 1; // Skip the cursor itself
      queryOptions.cursor = { id: cursor };
    }

    const posts = await prisma.post.findMany(queryOptions);

    // Determine if there are more pages
    const hasMore = posts.length > limit;
    const results = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    // If the user is logged in, check which posts they've liked
    let likedPostIds = new Set();
    if (req.user && results.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId: req.user.id,
          postId: { in: results.map(p => p.id) },
        },
        select: { postId: true },
      });
      likedPostIds = new Set(likes.map(l => l.postId));
    }

    const enrichedPosts = results.map(post => ({
      ...post,
      version: post.version.toString(), // BigInt → string for JSON serialization
      liked: likedPostIds.has(post.id),
    }));

    res.json({
      posts: enrichedPosts,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /posts/since/:timestamp → Incremental sync
// Returns posts created/updated/deleted since the given ISO timestamp.
// Uses cursor-based pagination for large changesets.
// --------------------------------------------------
router.get('/since/:timestamp', authenticate, async (req, res) => {
  try {
    const since = new Date(req.params.timestamp);
    if (isNaN(since.getTime())) {
      return res.status(400).json({ error: 'Invalid timestamp. Use ISO 8601 format.' });
    }

    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const cursor = req.query.cursor;

    const queryOptions = {
      take: limit + 1,
      where: {
        updatedAt: { gt: since },
      },
      orderBy: [
        { updatedAt: 'asc' },
        { id: 'asc' },
      ],
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    };

    if (cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = { id: cursor };
    }

    const posts = await prisma.post.findMany(queryOptions);

    const hasMore = posts.length > limit;
    const results = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    res.json({
      posts: results.map(p => ({
        ...p,
        version: p.version.toString(),
      })),
      nextCursor,
      hasMore,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /posts/:id → Get a single post by ID
// --------------------------------------------------
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!post || post.deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if current user liked this post
    let liked = false;
    if (req.user) {
      const like = await prisma.like.findUnique({
        where: {
          userId_postId: {
            userId: req.user.id,
            postId: post.id,
          },
        },
      });
      liked = !!like;
    }

    res.json({
      ...post,
      version: post.version.toString(),
      liked,
    });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// POST /posts → Create a new post
// --------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    const { content, imageUrl } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const post = await prisma.post.create({
      data: {
        authorId: req.user.id,
        content: content.trim(),
        imageUrl: imageUrl || null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      ...post,
      version: post.version.toString(),
      liked: false,
    });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// PUT /posts/:id → Update a post (author only)
// --------------------------------------------------
router.put('/:id', authenticate, async (req, res) => {
  try {
    // Verify ownership
    const existing = await prisma.post.findUnique({
      where: { id: req.params.id },
    });

    if (!existing || existing.deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    const { content, imageUrl } = req.body;
    const updateData = {};

    if (content !== undefined) updateData.content = content.trim();
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    const updated = await prisma.post.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      ...updated,
      version: updated.version.toString(),
    });
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// DELETE /posts/:id → Soft delete a post (author only)
// --------------------------------------------------
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.post.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await prisma.post.update({
      where: { id: req.params.id },
      data: { deleted: true },
    });

    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// POST /posts/sync → Bulk offline sync
// Accepts: { created: [...], updated: [...], deleted: [...] }
// Runs inside a transaction for consistency
// --------------------------------------------------
router.post('/sync', authenticate, async (req, res) => {
  try {
    const { created = [], updated = [], deleted = [] } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const createdPosts = [];
      const updatedPosts = [];
      const deletedIds = [];

      // Handle created items
      for (const localPost of created) {
        const post = await tx.post.create({
          data: {
            id: localPost.id || undefined, // Allow client-generated UUIDs
            authorId: req.user.id,
            content: localPost.content,
            imageUrl: localPost.imageUrl || null,
          },
        });
        createdPosts.push(post);
      }

      // Handle updated items (only if authored by current user)
      for (const local of updated) {
        const existing = await tx.post.findUnique({
          where: { id: local.id },
        });

        if (!existing || existing.authorId !== req.user.id) continue;

        const post = await tx.post.update({
          where: { id: local.id },
          data: {
            content: local.content ?? existing.content,
            imageUrl: local.imageUrl ?? existing.imageUrl,
          },
        });
        updatedPosts.push(post);
      }

      // Handle deleted items (only if authored by current user)
      for (const id of deleted) {
        const existing = await tx.post.findUnique({
          where: { id },
        });

        if (!existing || existing.authorId !== req.user.id) continue;

        await tx.post.update({
          where: { id },
          data: { deleted: true },
        });
        deletedIds.push(id);
      }

      return { createdPosts, updatedPosts, deletedIds };
    });

    res.json({
      success: true,
      created: result.createdPosts.length,
      updated: result.updatedPosts.length,
      deleted: result.deletedIds.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
