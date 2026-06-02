const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  due_date: { type: Date },
  file_path: { type: String }
}, { timestamps: true });

TaskSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id ? ret._id.toString() : ret.id;
    ret.created_at = ret.createdAt;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('Task', TaskSchema);
