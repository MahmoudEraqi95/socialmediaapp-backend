
class Post {
  constructor(id, user, content, imageUrl = null, likes = 0) {
    this.id = id;
    this.user = user;
    this.content = content;
    this.imageUrl = imageUrl;
    this.likes = likes;
    this.createdAt = new Date();
  }
}

const posts = [];

for (let i = 1; i <= 100; i++) {
  posts.push(
    new Post(
      i,
      `User_${i}`,
      `This is post number ${i}`,
      i % 5 === 0 ? `https://example.com/image${i}.jpg` : null,
      Math.floor(Math.random() * 100)
    )
  );
}

module.exports = { Post, posts };
