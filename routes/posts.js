// routes/posts.js
// Post routes layer — delegates query options and Prisma transactions to postRepository

const express = require('express');
const postRepository = require('../repositories/postRepository');
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
    const cursor = req.query.cursor;
    const userId = req.user ? req.user.id : null;

    const feedData = await postRepository.getFeed({ limit, cursor, userId });
    res.json(feedData);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /posts/since/:timestamp → Incremental sync
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

    const syncChanges = await postRepository.getSyncChanges({ since, limit, cursor });
    
    res.json({
      ...syncChanges,
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
    const userId = req.user ? req.user.id : null;
    const post = await postRepository.findById(req.params.id, userId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(post);
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

    const post = await postRepository.create({
      authorId: req.user.id,
      content: content.trim(),
      imageUrl: imageUrl || null,
    });

    res.status(201).json(post);
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
    const existing = await postRepository.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    const { content, imageUrl } = req.body;
    const updateData = {};

    if (content !== undefined) updateData.content = content.trim();
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    const updated = await postRepository.update(req.params.id, updateData);
    res.json(updated);
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
    const existing = await postRepository.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await postRepository.softDelete(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// POST /posts/sync → Bulk offline sync
// --------------------------------------------------
router.post('/sync', authenticate, async (req, res) => {
  try {
    const { created = [], updated = [], deleted = [] } = req.body;

    const result = await postRepository.bulkSync(req.user.id, {
      created,
      updated,
      deleted,
    });

    res.json({
      success: true,
      created: result.createdCount,
      updated: result.updatedCount,
      deleted: result.deletedCount,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
