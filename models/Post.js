
class Post {
  constructor(id, user, content, imageUrl = null) {
    var date = new Date()
    this.id = id;
    this.user = user;
    this.content = content;
    this.imageUrl = imageUrl;
    this.createdAt = date;
    this.updatedAt = date;
    this.deleted = false;
  }
}

const posts = [];

for (let i = 1; i <= 100; i++) {
  posts.push(
    new Post(
      i,
      `User_${i}`,
      `This is post number ${i}`,
      i % 5 === 0 ? `fake image url` : null,
      Math.floor(Math.random() * 100)
    )
  );
}

module.exports = { Post, posts };
