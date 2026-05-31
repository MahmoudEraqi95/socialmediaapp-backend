// routes/auth.js
// Authentication routes — controller layer delegates to userRepository

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

// --------------------------------------------------
// POST /auth/register → Create a new user account
// --------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'username, email, and password are required',
      });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({
        error: 'Username must be between 3 and 30 characters',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters',
      });
    }

    // Check for existing user
    const existing = await userRepository.findByUsernameOrEmail(username, email);
    if (existing) {
      return res.status(409).json({
        error: existing.username === username.toLowerCase()
          ? 'Username already taken'
          : 'Email already registered',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user in DB
    const user = await userRepository.create({
      username,
      email,
      passwordHash,
      displayName,
    });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// POST /auth/login → Authenticate and return JWT
// --------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({
        error: 'Provide (username or email) and password',
      });
    }

    // Find user
    const user = await userRepository.findByUsernameOrEmail(username, email);

    if (!user || user.deleted) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------------------------------------
// GET /auth/me → Return current user's profile
// --------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await userRepository.findById(req.user.id);

    if (!user || user.deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
