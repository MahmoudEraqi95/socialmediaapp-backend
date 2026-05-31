// repositories/userRepository.js
const prisma = require('../lib/prisma');

async function findById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
      deleted: true,
      _count: {
        select: { posts: true },
      },
    },
  });
}

async function findByUsernameOrEmail(username, email) {
  const conditions = [];
  if (username) conditions.push({ username: username.toLowerCase() });
  if (email) conditions.push({ email: email.toLowerCase() });

  if (conditions.length === 0) return null;

  return prisma.user.findFirst({
    where: {
      OR: conditions,
    },
  });
}

async function create({ username, email, passwordHash, displayName }) {
  return prisma.user.create({
    data: {
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName || username,
    },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
    },
  });
}

module.exports = {
  findById,
  findByUsernameOrEmail,
  create,
};
