require('dotenv').config();
const app = require('./api');
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});
