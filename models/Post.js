
class Post {
  constructor(id, user, content, imageUrl = null, version) {
    var date = new Date()
    this.id = id;
    this.user = user;
    this.content = content;
    this.imageUrl = imageUrl;
    this.createdAt = date;
    this.updatedAt = date;
    this.deleted = false;
    this.version = GLOBAL_VERSION;
  }
}
let GLOBAL_VERSION = 1;
let NEXT_ID = 1;

function getPostsVersion() {
  return ++GLOBAL_VERSION;
}

const posts = [];

for (let i = 1; i <= 100; i++) {
  posts.push(
    new Post(
      i,
      `User_${i}`,
      `This is post number ${i}`,
      `fake image url`
    )
  );
}
const tenDaysFromNow = new Date();
tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
let newVersion = getPostsVersion()
for (let i = 0; i < 10; i++) {
  posts[i].version = newVersion;
}


module.exports = { Post, posts, getPostsVersion };
