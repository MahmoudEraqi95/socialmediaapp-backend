// repositories/postRepository.js
const prisma = require('../lib/prisma');

async function getFeed({ limit, cursor, userId }) {
  const queryOptions = {
    take: limit + 1,
    where: { deleted: false },
    orderBy: { createdAt: 'desc' },
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

  const posts = await prisma.post.findMany(queryOptions);

  const hasMore = posts.length > limit;
  const results = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  // Check which posts the current user liked
  let likedPostIds = new Set();
  if (userId && results.length > 0) {
    const likes = await prisma.like.findMany({
      where: {
        userId,
        postId: { in: results.map(p => p.id) },
      },
      select: { postId: true },
    });
    likedPostIds = new Set(likes.map(l => l.postId));
  }

  const enrichedPosts = results.map(post => ({
    ...post,
    version: post.version.toString(),
    liked: likedPostIds.has(post.id),
  }));

  return {
    posts: enrichedPosts,
    nextCursor,
    hasMore,
  };
}

async function getSyncChanges({ since, limit, cursor }) {
  const queryOptions = {
    take: limit + 1,
    where: {
      updatedAt: { gt: since },
    },
    orderBy: [
      { updatedAt: 'asc' },
      { id: 'asc' },
    ],
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

  const posts = await prisma.post.findMany(queryOptions);

  const hasMore = posts.length > limit;
  const results = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  return {
    posts: results.map(p => ({
      ...p,
      version: p.version.toString(),
    })),
    nextCursor,
    hasMore,
  };
}

async function findById(id, userId = null) {
  const post = await prisma.post.findUnique({
    where: { id },
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

  if (!post || post.deleted) return null;

  let liked = false;
  if (userId) {
    const like = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId: post.id,
        },
      },
    });
    liked = !!like;
  }

  return {
    ...post,
    version: post.version.toString(),
    liked,
  };
}

async function create({ authorId, content, imageUrl }) {
  const post = await prisma.post.create({
    data: {
      authorId,
      content,
      imageUrl,
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
  });

  return {
    ...post,
    version: post.version.toString(),
    liked: false,
  };
}

async function update(id, data) {
  const updated = await prisma.post.update({
    where: { id },
    data,
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

  return {
    ...updated,
    version: updated.version.toString(),
  };
}

async function softDelete(id) {
  return prisma.post.update({
    where: { id },
    data: { deleted: true },
  });
}

async function bulkSync(userId, { created, updated, deleted }) {
  return prisma.$transaction(async (tx) => {
    const createdPosts = [];
    const updatedPosts = [];
    const deletedIds = [];

    // Created
    for (const localPost of created) {
      const post = await tx.post.create({
        data: {
          id: localPost.id || undefined,
          authorId: userId,
          content: localPost.content,
          imageUrl: localPost.imageUrl || null,
        },
      });
      createdPosts.push(post);
    }

    // Updated
    for (const local of updated) {
      const existing = await tx.post.findUnique({
        where: { id: local.id },
      });

      if (!existing || existing.authorId !== userId) continue;

      const post = await tx.post.update({
        where: { id: local.id },
        data: {
          content: local.content ?? existing.content,
          imageUrl: local.imageUrl ?? existing.imageUrl,
        },
      });
      updatedPosts.push(post);
    }

    // Deleted
    for (const id of deleted) {
      const existing = await tx.post.findUnique({
        where: { id },
      });

      if (!existing || existing.authorId !== userId) continue;

      await tx.post.update({
        where: { id },
        data: { deleted: true },
      });
      deletedIds.push(id);
    }

    return {
      createdCount: createdPosts.length,
      updatedCount: updatedPosts.length,
      deletedCount: deletedIds.length,
    };
  });
}

module.exports = {
  getFeed,
  getSyncChanges,
  findById,
  create,
  update,
  softDelete,
  bulkSync,
};
