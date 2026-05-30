// index.js
// Social Media Backend — Entry Point

require('dotenv').config();

const express = require('express');
const prisma = require('./lib/prisma');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// Middleware
// --------------------------------------------------
app.use(express.json({ limit: '10mb' }));

// --------------------------------------------------
// Routes
// --------------------------------------------------
const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const likesRoutes = require('./routes/likes');
const commentsRoutes = require('./routes/comments');

app.get('/', (req, res) => {
  res.json({
    name: 'Social Media Backend',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      auth: '/auth (register, login, me)',
      posts: '/posts (CRUD, feed, sync)',
      likes: '/posts/:postId/likes (toggle, list)',
      comments: '/posts/:postId/comments (CRUD, replies)',
    },
  });
});

app.use('/auth', authRoutes);
app.use('/posts', postsRoutes);
app.use('/posts/:postId/likes', likesRoutes);
app.use('/posts/:postId/comments', commentsRoutes);

// Comment replies endpoint (outside of nested params)
app.use('/comments', commentsRoutes);

// --------------------------------------------------
// Global error handler
// --------------------------------------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// --------------------------------------------------
// Graceful shutdown — disconnect Prisma on SIGTERM/SIGINT
// --------------------------------------------------
async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));