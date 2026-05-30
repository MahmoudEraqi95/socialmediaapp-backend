// middleware/auth.js
// JWT authentication middleware

const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT from the Authorization header.
 * On success, attaches `req.user = { id, username }` for downstream routes.
 * On failure, returns 401 Unauthorized.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optional auth — attaches req.user if a valid token is present,
 * but does NOT reject the request if missing.
 * Useful for public endpoints that show extra data for logged-in users
 * (e.g., "did I like this post?").
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
    };
  } catch {
    // Token is invalid/expired — continue without user context
  }

  next();
}

module.exports = { authenticate, optionalAuth };
