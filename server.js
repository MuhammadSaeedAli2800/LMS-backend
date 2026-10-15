const app = require('./app');
const config = require('./config/env');
const { connectDB } = require('./config/db');

connectDB()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
    });
  })
  .catch(() => {
    console.error('Could not connect to the database');
    process.exit(1);
  });
