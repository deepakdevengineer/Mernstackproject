const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');

// In-memory user database for simulation fallback
const mockUsers = [];

// @route   POST api/auth/register
// @desc    Register a user
// @access  Public
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (global.useMockDB) {
      const exists = mockUsers.find(u => u.email === email || u.username === username);
      if (exists) {
        return res.status(400).json({ message: 'User with this username or email already exists' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const user = {
        id: 'mock_user_' + Date.now(),
        username,
        email,
        password: hashedPassword,
        createdAt: new Date()
      };
      mockUsers.push(user);

      const payload = {
        user: {
          id: user.id,
          username: user.username
        }
      };

      const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';
      return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
        if (err) throw err;
        res.json({ token, username: user.username });
      });
    }

    // Check if user already exists
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      return res.status(400).json({ message: 'User with this username or email already exists' });
    }

    user = new User({
      username,
      email,
      password
    });

    await user.save();

    // Create JWT
    const payload = {
      user: {
        id: user.id,
        username: user.username
      }
    };

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';
    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, username: user.username });
      }
    );
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (global.useMockDB) {
      const user = mockUsers.find(u => u.email === email);
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const payload = {
        user: {
          id: user.id,
          username: user.username
        }
      };

      const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';
      return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
        if (err) throw err;
        res.json({ token, username: user.username });
      });
    }

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT
    const payload = {
      user: {
        id: user.id,
        username: user.username
      }
    };

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';
    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, username: user.username });
      }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/auth/me
// @desc    Get logged in user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    if (global.useMockDB) {
      const user = mockUsers.find(u => u.id === req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      const { password, ...details } = user;
      return res.json(details);
    }

    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error('Auth check error:', err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
