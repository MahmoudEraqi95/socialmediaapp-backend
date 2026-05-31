// routes/comments.js
// Comment CRUD with nested replies (one level)

const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// --------------------------------------------------
// POST /posts/:postId/comments → Create a comment
// Body: { content, parentId? }
// --------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    // Verify the post exists and is not deleted
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // If replying to a comment, verify the parent exists
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
      });

      if (!parent || parent.deleted || parent.postId !== postId) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }

      // Prevent deep nesting — only allow replies to top-level comments
      if (parent.parentId) {
        return res.status(400).json({
          error: 'Cannot reply to a reply. Only one level of nesting is supported.',
        });
      }
    }

    // Create comment and increment counter atomically
    const [comment] = await prisma.$transaction([
      prisma.comment.create({
        data: {
          authorId: req.user.id,
          postId,
          parentId: parentId || null,
          content: content.trim(),
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
      }),
      prisma.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      }),
    ]);

    res.status(201).json(comment);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /posts/:postId/comments → List comments for a post
// Returns top-level comments with their replies
// Query params: ?cursor=<commentId>&limit=<n>
// --------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { postId } = req.params;
    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const cursor = req.query.cursor;

    // Verify the post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const queryOptions = {
      take: limit + 1,
      where: {
        postId,
        parentId: null, // Only top-level comments
        deleted: false,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replies: {
          where: { deleted: false },
          orderBy: { createdAt: 'asc' },
          take: 3, // Show first 3 replies inline, client can load more
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
        },
        _count: {
          select: { replies: true },
        },
      },
    };

    if (cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = { id: cursor };
    }

    const comments = await prisma.comment.findMany(queryOptions);

    const hasMore = comments.length > limit;
    const results = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    res.json({
      comments: results,
      totalCount: post.commentCount,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error('List comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /comments/:id/replies → Load all replies for a comment
// Query params: ?cursor=<replyId>&limit=<n>
// --------------------------------------------------
router.get('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const cursor = req.query.cursor;

    const parent = await prisma.comment.findUnique({
      where: { id },
    });

    if (!parent || parent.deleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const queryOptions = {
      take: limit + 1,
      where: {
        parentId: id,
        deleted: false,
      },
      orderBy: { createdAt: 'asc' },
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

    const replies = await prisma.comment.findMany(queryOptions);

    const hasMore = replies.length > limit;
    const results = hasMore ? replies.slice(0, limit) : replies;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    res.json({
      replies: results,
      nextCursor,
      hasMore,
    });
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
    const existing = await prisma.comment.findUnique({
      where: { id: req.params.id },
    });

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

    const updated = await prisma.comment.update({
      where: { id: req.params.id },
      data: { content: content.trim() },
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
    const existing = await prisma.comment.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    // Soft delete and decrement counter atomically
    await prisma.$transaction([
      prisma.comment.update({
        where: { id: req.params.id },
        data: { deleted: true },
      }),
      prisma.post.update({
        where: { id: existing.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ]);

    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
