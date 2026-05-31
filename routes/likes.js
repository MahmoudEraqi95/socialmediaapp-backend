// routes/likes.js
const express = require('express');
const likeRepository = require('../repositories/likeRepository');
const postRepository = require('../repositories/postRepository');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// --------------------------------------------------
// POST /posts/:postId/likes → Toggle like on a post
// --------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    // Verify the post exists
    const post = await postRepository.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if already liked
    const existingLike = await likeRepository.findLike(userId, postId);

    if (existingLike) {
      // Unlike
      await likeRepository.deleteLike(existingLike.id, postId);
      return res.json({
        liked: false,
        likeCount: post.likeCount - 1,
      });
    } else {
      // Like
      await likeRepository.createLike(userId, postId);
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
// --------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { postId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const cursor = req.query.cursor;

    // Verify post exists
    const post = await postRepository.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const likeData = await likeRepository.getPostLikers(postId, { limit, cursor });

    res.json({
      ...likeData,
      totalCount: post.likeCount,
    });
  } catch (err) {
    console.error('List likes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
