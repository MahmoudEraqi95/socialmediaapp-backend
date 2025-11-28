const express = require('express');
const app = express();

const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});
const postsRoute = require('./routes/posts');

app.use(express.json());

// Use the posts API
app.use('/posts', postsRoute);


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});