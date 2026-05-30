// routes/likes.js
// Like/unlike a post with atomic counter updates

const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// --------------------------------------------------
// POST /posts/:postId/like → Toggle like on a post
// If already liked → unlike (delete like, decrement counter)
// If not liked → like (create like, increment counter)
// --------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    // Verify the post exists and is not deleted
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
    });

    if (existingLike) {
      // Unlike — delete like and decrement counter atomically
      await prisma.$transaction([
        prisma.like.delete({
          where: { id: existingLike.id },
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);

      return res.json({
        liked: false,
        likeCount: post.likeCount - 1,
      });
    } else {
      // Like — create like and increment counter atomically
      await prisma.$transaction([
        prisma.like.create({
          data: { userId, postId },
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);

      return res.json({
        liked: true,
        likeCount: post.likeCount + 1,
      });
    }
  } catch (err) {
    console.error('Like toggle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /posts/:postId/likes → List users who liked a post
// Query params: ?cursor=<likeId>&limit=<n>
// --------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { postId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
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
      where: { postId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
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

    const likes = await prisma.like.findMany(queryOptions);

    const hasMore = likes.length > limit;
    const results = hasMore ? likes.slice(0, limit) : likes;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    res.json({
      likes: results.map(l => ({
        id: l.id,
        user: l.user,
        createdAt: l.createdAt,
      })),
      totalCount: post.likeCount,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error('List likes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
