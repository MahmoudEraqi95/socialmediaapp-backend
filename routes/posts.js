// routes/posts.js
const express = require('express');
const router = express.Router();
const { Post, posts } = require('../models/Post');


// --------------------------------------------------
// GET /posts → return all posts (excluding deleted)
// --------------------------------------------------
router.get('/', (req, res) => {
  res.json(posts.filter(p => !p.deleted));
});


// --------------------------------------------------
// GET /posts/since/:timestamp → incremental sync
// Returns posts created/updated since last sync
// --------------------------------------------------
router.get('/since/:timestamp', (req, res) => {
  const since = new Date(parseInt(req.params.timestamp));

  const updatedPosts = posts.filter(p => p.updatedAt > since);

  res.json(updatedPosts);
});


// --------------------------------------------------
// POST /posts → create a new post
// --------------------------------------------------
router.post('/', (req, res) => {
  const { user, content, imageUrl } = req.body;

  const id = posts.length ? posts[posts.length - 1].id + 1 : 1;
  const newPost = new Post(id, user, content, imageUrl);

  posts.push(newPost);

  res.json(newPost);
});


// --------------------------------------------------
// PUT /posts/:id → update a post
// --------------------------------------------------
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const post = posts.find(p => p.id === id);

  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { content, imageUrl, likes } = req.body;

  if (content !== undefined) post.content = content;
  if (imageUrl !== undefined) post.imageUrl = imageUrl;
  if (likes !== undefined) post.likes = likes;

  post.updatedAt = new Date();

  res.json(post);
});


// --------------------------------------------------
// DELETE /posts/:id → mark as deleted (soft delete)
// --------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const post = posts.find(p => p.id === id);

  if (!post) return res.status(404).json({ error: 'Post not found' });

  post.deleted = true;
  post.updatedAt = new Date();

  res.json({ success: true, id });
});


// --------------------------------------------------
// POST /posts/sync
// Accepts mobile's local changes in bulk:
// { created: [...], updated: [...], deleted: [...] }
// --------------------------------------------------
router.post('/sync', (req, res) => {
  const { created = [], updated = [], deleted = [] } = req.body;

  // Handle created items
  created.forEach(localPost => {
    const id = posts.length ? posts[posts.length - 1].id + 1 : 1;
    const newPost = new Post(id, localPost.user, localPost.content, localPost.imageUrl);
    posts.push(newPost);
  });

  // Handle updated items
  updated.forEach(local => {
    const existing = posts.find(p => p.id === local.id);
    if (existing && !existing.deleted) {
      existing.content = local.content ?? existing.content;
      existing.imageUrl = local.imageUrl ?? existing.imageUrl;
      existing.likes = local.likes ?? existing.likes;
      existing.updatedAt = new Date();
    }
  });

  // Handle deleted items
  deleted.forEach(id => {
    const p = posts.find(p => p.id === id);
    if (p) {
      p.deleted = true;
      p.updatedAt = new Date();
    }
  });

  res.json({ success: true });
});


module.exports = router;
