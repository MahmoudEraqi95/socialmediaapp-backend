// routes/comments.js
const express = require('express');
const commentRepository = require('../repositories/commentRepository');
const postRepository = require('../repositories/postRepository');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// --------------------------------------------------
// POST /posts/:postId/comments → Create a comment
// --------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    // Verify post exists
    const post = await postRepository.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check parent if nested reply
    if (parentId) {
      const parent = await commentRepository.findById(parentId);
      if (!parent || parent.deleted || parent.postId !== postId) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }

      if (parent.parentId) {
        return res.status(400).json({
          error: 'Cannot reply to a reply. Only one level of nesting is supported.',
        });
      }
    }

    const comment = await commentRepository.create({
      authorId: req.user.id,
      postId,
      parentId,
      content,
    });

    res.status(201).json(comment);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /posts/:postId/comments → List comments for a post
// --------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { postId } = req.params;
    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const cursor = req.query.cursor;

    // Verify post exists
    const post = await postRepository.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const commentData = await commentRepository.getPostComments(postId, { limit, cursor });

    res.json({
      ...commentData,
      totalCount: post.commentCount,
    });
  } catch (err) {
    console.error('List comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /comments/:id/replies → Load replies for a comment
// --------------------------------------------------
router.get('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const cursor = req.query.cursor;

    const parent = await commentRepository.findById(id);
    if (!parent || parent.deleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const replyData = await commentRepository.getReplies(id, { limit, cursor });
    res.json(replyData);
  } catch (err) {
    console.error('List replies error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// PUT /comments/:id → Edit a comment (author only)
// --------------------------------------------------
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await commentRepository.findById(req.params.id);

    if (!existing || existing.deleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const updated = await commentRepository.update(req.params.id, content);
    res.json(updated);
  } catch (err) {
    console.error('Edit comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// DELETE /comments/:id → Soft delete (author only)
// --------------------------------------------------
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await commentRepository.findById(req.params.id);

    if (!existing || existing.deleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    await commentRepository.softDelete(req.params.id, existing.postId);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
