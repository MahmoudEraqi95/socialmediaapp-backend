// routes/posts.js
const express = require('express');
const router = express.Router();
const { posts } = require('../models/Post');

// GET /posts
router.get('/', (req, res) => {
  res.json(posts);
});

module.exports = router;
