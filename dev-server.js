// dev-server.js
require('dotenv').config();
const app = require('./src/api/index');
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});