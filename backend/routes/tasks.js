const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// @route   POST api/tasks
// @desc    Create and run a new AI task
// @access  Private
router.post('/', auth, async (req, res) => {
  const { title, inputText, operationType } = req.body;

  // Basic validation
  if (!title || !inputText || !operationType) {
    return res.status(400).json({ message: 'Title, input text, and operation type are required' });
  }

  const validOperations = ['uppercase', 'lowercase', 'reverse', 'word_count'];
  if (!validOperations.includes(operationType.toLowerCase())) {
    return res.status(400).json({ message: 'Invalid operation type' });
  }

  try {
    // Create database entry
    const task = new Task({
      title,
      inputText,
      operationType: operationType.toLowerCase(),
      status: 'pending',
      userId: req.user.id,
      logs: ['[System] Task created successfully', '[System] Queuing task in Redis...']
    });

    await task.save();

    // Push task ID to Redis queue
    const redisClient = req.app.get('redisClient');
    if (redisClient && redisClient.isOpen) {
      await redisClient.lPush('task_queue', task._id.toString());
      
      // Update logs in background
      task.logs.push('[System] Task successfully queued');
      await task.save();
    } else {
      console.warn('Redis client is not available. Running in local fallback mode (simulating worker)...');
      task.status = 'failed';
      task.logs.push('[Error] Redis queue unavailable. Task could not be processed.');
      await task.save();
      return res.status(503).json({ 
        message: 'Task created but worker queue is offline. Task marked as failed.',
        task 
      });
    }

    res.status(201).json(task);
  } catch (err) {
    console.error('Create task error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/tasks
// @desc    Get all tasks for logged in user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error('Fetch tasks error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/tasks/:id
// @desc    Get task by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.id || req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Verify task owner
    if (task.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json(task);
  } catch (err) {
    console.error('Fetch single task error:', err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;
