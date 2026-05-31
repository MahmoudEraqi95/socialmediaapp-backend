// repositories/commentRepository.js
const prisma = require('../lib/prisma');

async function findById(id) {
  return prisma.comment.findUnique({
    where: { id },
  });
}

async function create({ authorId, postId, parentId, content }) {
  // Create comment and increment counter atomically
  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: {
        authorId,
        postId,
        parentId: parentId || null,
        content: content.trim(),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    }),
  ]);

  return comment;
}

async function getPostComments(postId, { limit, cursor }) {
  const queryOptions = {
    take: limit + 1,
    where: {
      postId,
      parentId: null,
      deleted: false,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      replies: {
        where: { deleted: false },
        orderBy: { createdAt: 'asc' },
        take: 3,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
      _count: {
        select: { replies: true },
      },
    },
  };

  if (cursor) {
    queryOptions.skip = 1;
    queryOptions.cursor = { id: cursor };
  }

  const comments = await prisma.comment.findMany(queryOptions);

  const hasMore = comments.length > limit;
  const results = hasMore ? comments.slice(0, limit) : comments;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  return {
    comments: results,
    nextCursor,
    hasMore,
  };
}

async function getReplies(commentId, { limit, cursor }) {
  const queryOptions = {
    take: limit + 1,
    where: {
      parentId: commentId,
      deleted: false,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      author: {
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

  const replies = await prisma.comment.findMany(queryOptions);

  const hasMore = replies.length > limit;
  const results = hasMore ? replies.slice(0, limit) : replies;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  return {
    replies: results,
    nextCursor,
    hasMore,
  };
}

async function update(id, content) {
  return prisma.comment.update({
    where: { id },
    data: { content: content.trim() },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
}

async function softDelete(id, postId) {
  return prisma.$transaction([
    prisma.comment.update({
      where: { id },
      data: { deleted: true },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { commentCount: { decrement: 1 } },
    }),
  ]);
}

module.exports = {
  findById,
  create,
  getPostComments,
  getReplies,
  update,
  softDelete,
};
