const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const config = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

mongoose.set('strictQuery', true);

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: config.clientOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.use(errorHandler);

module.exports = app;
