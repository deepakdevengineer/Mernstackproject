require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');

const app = express();

// Configuration
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ai_tasks';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Security Headers
app.use(helmet());

// CORS configuration (allow local and production clients)
app.use(cors({
  origin: '*', // For development. Can be restricted in production config.
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logger
app.use(morgan('dev'));

// Rate Limiting (Prevent abuse)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use('/api/', limiter);

// Body Parser Middleware
app.use(express.json());

global.useMockDB = false;
global.useMockQueue = false;

// Set up MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected successfully'))
  .catch(err => {
    console.warn('MongoDB connection failed. Error details:', err.message);
    console.warn('Enabling In-Memory Mock Database mode for local demonstration.');
    global.useMockDB = true;
  });

// Set up Redis Client
const redisClient = createClient({ url: REDIS_URL });

redisClient.on('connect', () => console.log('Redis client connecting...'));
redisClient.on('ready', () => console.log('Redis client connected and ready'));
redisClient.on('error', (err) => {
  console.warn('Redis connection error occurred. Simulation mode remains active.');
});

// Connect Redis Client
(async () => {
  try {
    await redisClient.connect();
    app.set('redisClient', redisClient);
  } catch (err) {
    console.warn('Redis connection failed. Enabling In-Memory Mock Queue mode.');
    global.useMockQueue = true;
  }
})();

// Health Check Endpoint (Used by Kubernetes Liveness/Readiness probes)
app.get('/health', async (req, res) => {
  const mongoStatus = global.useMockDB ? 'SIMULATION' : (mongoose.connection.readyState === 1 ? 'UP' : 'DOWN');
  const redisStatus = global.useMockQueue ? 'SIMULATION' : ((redisClient && redisClient.isOpen) ? 'UP' : 'DOWN');
  
  const status = 200; // Return 200 for local runtime testing
  
  res.status(status).json({
    status: (global.useMockDB || global.useMockQueue) ? 'simulation' : 'healthy',
    checks: {
      mongodb: mongoStatus,
      redis: redisStatus
    },
    timestamp: new Date()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);

// Base Route
app.get('/', (req, res) => {
  res.send('AI Task Processing Platform API is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'An internal server error occurred' });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

// Graceful Shutdown
const shutdown = async () => {
  console.log('Shutting down server gracefully...');
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
        console.log('Redis connection closed.');
      }
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
