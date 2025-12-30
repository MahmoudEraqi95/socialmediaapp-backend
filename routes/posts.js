// routes/posts.js
const express = require('express');
const router = express.Router();
const { Post, posts, getPostsVersion } = require('../models/Post');

// --------------------------------------------------
// Global version + ID counters (in-memory)
// --------------------------------------------------


// --------------------------------------------------
// GET /posts → return all posts (excluding deleted)
// --------------------------------------------------
router.get('/', (req, res) => {
  res.json(posts.filter(p => !p.deleted));
});

// --------------------------------------------------
// GET /posts/since/:version → incremental sync
// Returns created/updated/deleted posts since version
// --------------------------------------------------
router.get('/since/:version', (req, res) => {
  const version = parseInt(req.params.version, 10) || 0;
  const updatedPosts = posts.filter(p => p.version > version);
  res.json(updatedPosts);
});

// --------------------------------------------------
// POST /posts → create a new post
// --------------------------------------------------
router.post('/', (req, res) => {
  const { user, content, imageUrl } = req.body;

  const id = NEXT_ID++;
  const newPost = new Post(id, user, content, imageUrl);

  newPost.version = getPostsVersion();
  newPost.deleted = false;

  posts.push(newPost);

  res.json(newPost);
});

// --------------------------------------------------
// PUT /posts/:id → update a post
// --------------------------------------------------
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = posts.find(p => p.id === id && !p.deleted);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const { content, imageUrl, likes } = req.body;

  if (content !== undefined) post.content = content;
  if (imageUrl !== undefined) post.imageUrl = imageUrl;
  if (likes !== undefined) post.likes = likes;

  post.version = getPostsVersion();

  res.json(post);
});

// --------------------------------------------------
// DELETE /posts/:id → soft delete
// --------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = posts.find(p => p.id === id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  post.deleted = true;
  post.version = getPostsVersion();

  res.json({ success: true, id });
});

// --------------------------------------------------
// POST /posts/sync
// Accepts bulk offline changes
// { created: [...], updated: [...], deleted: [...] }
// --------------------------------------------------
router.post('/sync', (req, res) => {
  const { created = [], updated = [], deleted = [] } = req.body;

  // Handle created items
  created.forEach(localPost => {
    const id = NEXT_ID++;
    const newPost = new Post(
      id,
      localPost.user,
      localPost.content,
      localPost.imageUrl
    );

    newPost.likes = localPost.likes ?? 0;
    newPost.deleted = false;
    newPost.version = getPostsVersion();

    posts.push(newPost);
  });

  // Handle updated items
  updated.forEach(local => {
    const existing = posts.find(p => p.id === local.id && !p.deleted);
    if (!existing) return;

    existing.content = local.content ?? existing.content;
    existing.imageUrl = local.imageUrl ?? existing.imageUrl;
    existing.likes = local.likes ?? existing.likes;
    existing.version = getPostsVersion();
  });

  // Handle deleted items
  deleted.forEach(id => {
    const post = posts.find(p => p.id === id);
    if (!post) return;

    post.deleted = true;
    post.version = getPostsVersion();
  });

  res.json({
    success: true,
    currentVersion: GLOBAL_VERSION
  });
});

module.exports = router;
