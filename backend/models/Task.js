const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true
  },
  inputText: {
    type: String,
    required: [true, 'Input text is required']
  },
  operationType: {
    type: String,
    required: [true, 'Operation type is required'],
    enum: ['uppercase', 'lowercase', 'reverse', 'word_count']
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'success', 'failed'],
    default: 'pending'
  },
  result: {
    type: String,
    default: null
  },
  logs: {
    type: [String],
    default: []
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  executionTimeMs: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index to retrieve user tasks quickly
TaskSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Task', TaskSchema);
