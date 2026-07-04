const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// In-memory task list for database simulation fallback
const mockTasks = [];

// Worker Simulation helper
function simulateWorkerForMock(task) {
  setTimeout(async () => {
    task.status = 'running';
    task.logs.push('[Worker] Task claimed by worker process (PID: SIM_9999)');
    task.logs.push('[Worker] Status updated to RUNNING');
    task.logs.push(`[Worker] Running operation '${task.operationType}'...`);
    task.updatedAt = new Date();

    const start = Date.now();
    let result = '';
    const operation = task.operationType.toLowerCase();
    const input = task.inputText;

    try {
      if (operation === 'uppercase') {
        result = input.toUpperCase();
        task.logs.push('[Worker] Conversion to UPPERCASE complete.');
      } else if (operation === 'lowercase') {
        result = input.toLowerCase();
        task.logs.push('[Worker] Conversion to lowercase complete.');
      } else if (operation === 'reverse') {
        result = input.split('').reverse().join('');
        task.logs.push('[Worker] Text reversed successfully.');
      } else if (operation === 'word_count') {
        const words = input.split(/\s+/).filter(w => w.trim());
        result = words.length.toString();
        task.logs.push(`[Worker] Word count completed. Total: {result} words.`);
      } else if (operation === 'gemini_ai') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
          task.logs.push('[Worker] Querying Google Gemini API (gemini-1.5-flash)...');
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: input }] }]
            })
          });
          const data = await response.json();
          if (data.candidates && data.candidates[0].content.parts[0].text) {
            result = data.candidates[0].content.parts[0].text;
            task.logs.push('[Worker] Gemini AI response received successfully.');
          } else {
            throw new Error(JSON.stringify(data));
          }
        } else {
          result = `[Simulation Fallback] Gemini API Key not set. Prompt was: "${input}"`;
          task.logs.push('[Worker] Simulated response generated (missing API Key).');
        }
      }

      const executionTime = Date.now() - start + 25;
      task.status = 'success';
      task.result = result;
      task.executionTimeMs = executionTime;
      task.logs.push(`[Worker] Task completed successfully in ${executionTime} ms`);
      task.logs.push('[Worker] Saving results...');
    } catch (err) {
      task.status = 'failed';
      task.logs.push(`[Error] Operation failed: ${err.message}`);
      task.logs.push('[Worker] Status updated to FAILED');
    }
    task.updatedAt = new Date();
  }, 2500);
}

function simulateWorkerForDB(taskId) {
  setTimeout(async () => {
    try {
      const dbTask = await Task.findById(taskId);
      if (!dbTask) return;

      dbTask.status = 'running';
      dbTask.logs.push('[Worker] Task claimed by worker process (PID: SIM_9999)');
      dbTask.logs.push('[Worker] Status updated to RUNNING');
      dbTask.logs.push(`[Worker] Running operation '${dbTask.operationType}'...`);
      await dbTask.save();

      const start = Date.now();
      let result = '';
      const operation = dbTask.operationType.toLowerCase();
      const input = dbTask.inputText;

      try {
        if (operation === 'uppercase') {
          result = input.toUpperCase();
          dbTask.logs.push('[Worker] Conversion to UPPERCASE complete.');
        } else if (operation === 'lowercase') {
          result = input.toLowerCase();
          dbTask.logs.push('[Worker] Conversion to lowercase complete.');
        } else if (operation === 'reverse') {
          result = input.split('').reverse().join('');
          dbTask.logs.push('[Worker] Text reversed successfully.');
        } else if (operation === 'word_count') {
          result = input.split(/\s+/).filter(w => w.trim()).length.toString();
          dbTask.logs.push(`[Worker] Word count completed. Total: ${result} words.`);
        } else if (operation === 'gemini_ai') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (apiKey) {
            dbTask.logs.push('[Worker] Querying Google Gemini API (gemini-1.5-flash)...');
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: input }] }]
              })
            });
            const data = await response.json();
            if (data.candidates && data.candidates[0].content.parts[0].text) {
              result = data.candidates[0].content.parts[0].text;
              dbTask.logs.push('[Worker] Gemini AI response received successfully.');
            } else {
              throw new Error(JSON.stringify(data));
            }
          } else {
            result = `[Simulation Fallback] Gemini API Key not set. Prompt was: "${input}"`;
            dbTask.logs.push('[Worker] Simulated response generated (missing API Key).');
          }
        }

        const executionTime = Date.now() - start + 25;
        dbTask.status = 'success';
        dbTask.result = result;
        dbTask.executionTimeMs = executionTime;
        dbTask.logs.push(`[Worker] Task completed successfully in ${executionTime} ms`);
        dbTask.logs.push('[Worker] Saving results...');
      } catch (err) {
        dbTask.status = 'failed';
        dbTask.logs.push(`[Error] Operation failed: ${err.message}`);
        dbTask.logs.push('[Worker] Status updated to FAILED');
      }
      await dbTask.save();
    } catch (err) {
      console.error('Error in DB worker simulation:', err);
    }
  }, 2500);
}

// @route   POST api/tasks
// @desc    Create and run a new AI task
// @access  Private
router.post('/', auth, async (req, res) => {
  const { title, inputText, operationType } = req.body;

  // Basic validation
  if (!title || !inputText || !operationType) {
    return res.status(400).json({ message: 'Title, input text, and operation type are required' });
  }

  const validOperations = ['uppercase', 'lowercase', 'reverse', 'word_count', 'gemini_ai'];
  if (!validOperations.includes(operationType.toLowerCase())) {
    return res.status(400).json({ message: 'Invalid operation type' });
  }

  try {
    if (global.useMockDB) {
      const task = {
        _id: 'mock_task_' + Date.now(),
        title,
        inputText,
        operationType: operationType.toLowerCase(),
        status: 'pending',
        userId: req.user.id,
        logs: ['[System] Task created successfully', '[System] Queuing task in Redis...'],
        result: null,
        executionTimeMs: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      task.logs.push('[System] Task successfully queued (Simulation)');
      mockTasks.push(task);
      
      // Run background worker simulation
      simulateWorkerForMock(task);
      return res.status(201).json(task);
    }

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
    if (redisClient && redisClient.isOpen && !global.useMockQueue) {
      await redisClient.lPush('task_queue', task._id.toString());
      
      // Update logs in background
      task.logs.push('[System] Task successfully queued');
      await task.save();
    } else {
      console.warn('Redis client is not available. Running in local fallback mode (simulating worker)...');
      task.logs.push('[System] Task queued (simulation fallback)');
      await task.save();
      
      // Trigger background simulated worker run directly on MongoDB
      simulateWorkerForDB(task._id);
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
    if (global.useMockDB) {
      const tasks = mockTasks
        .filter(t => t.userId === req.user.id)
        .sort((a, b) => b.createdAt - a.createdAt);
      return res.json(tasks);
    }

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
    if (global.useMockDB) {
      const task = mockTasks.find(t => t._id === req.params.id);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      if (task.userId !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      return res.json(task);
    }

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
