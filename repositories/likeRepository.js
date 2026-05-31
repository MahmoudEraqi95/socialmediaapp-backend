// repositories/likeRepository.js
const prisma = require('../lib/prisma');

async function findLike(userId, postId) {
  return prisma.like.findUnique({
    where: {
      userId_postId: { userId, postId },
    },
  });
}

async function createLike(userId, postId) {
  return prisma.$transaction([
    prisma.like.create({
      data: { userId, postId },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
    }),
  ]);
}

async function deleteLike(likeId, postId) {
  return prisma.$transaction([
    prisma.like.delete({
      where: { id: likeId },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { likeCount: { decrement: 1 } },
    }),
  ]);
}

async function getPostLikers(postId, { limit, cursor }) {
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

  return {
    likes: results.map(l => ({
      id: l.id,
      user: l.user,
      createdAt: l.createdAt,
    })),
    nextCursor,
    hasMore,
  };
}

module.exports = {
  findLike,
  createLike,
  deleteLike,
  getPostLikers,
};
