const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    enum: [
      'General Inquiry',
      'Product Support',
      'Order Issue',
      'Delivery Problem',
      'Return/Refund',
      'Partnership Inquiry',
      'Feedback',
      'Other'
    ]
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    minlength: [10, 'Message must be at least 10 characters'],
    maxlength: [5000, 'Message cannot exceed 5000 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'read', 'in-progress', 'resolved', 'spam'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  response: String,
  respondedAt: Date,
  ipAddress: String,
  userAgent: String,
  source: {
    type: String,
    default: 'website',
    enum: ['website', 'mobile-app', 'api']
  },
  tags: [String]
}, {
  timestamps: true
});

contactSchema.index({ email: 1 });
contactSchema.index({ status: 1 });
contactSchema.index({ createdAt: -1 });
contactSchema.index({ priority: 1 });
contactSchema.index({ subject: 1 });
contactSchema.index({ name: 'text', email: 'text', message: 'text' });

contactSchema.pre('save', function(next) {
  if (this.isNew) {
    const urgentSubjects = ['Order Issue', 'Delivery Problem', 'Return/Refund'];
    if (urgentSubjects.includes(this.subject)) {
      this.priority = 'high';
    }
    this.tags = this.tags || [];
    if (this.subject === 'Feedback') {
      this.tags.push('feedback');
    }
  }
  next();
});

contactSchema.methods.markAsRead = function() {
  this.status = 'read';
  return this.save();
};

contactSchema.methods.assignTo = function(userId) {
  this.assignedTo = userId;
  this.status = 'in-progress';
  return this.save();
};

contactSchema.methods.resolve = function(response, userId) {
  this.status = 'resolved';
  this.response = response;
  this.assignedTo = userId;
  this.respondedAt = new Date();
  return this.save();
};

contactSchema.statics.getPending = function() {
  return this.find({ status: 'pending' }).sort({ priority: -1, createdAt: 1 });
};

contactSchema.statics.getByStatus = function(status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

contactSchema.statics.search = function(query) {
  return this.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
      { phone: { $regex: query, $options: 'i' } },
      { subject: { $regex: query, $options: 'i' } },
      { message: { $regex: query, $options: 'i' } }
    ]
  }).sort({ createdAt: -1 });
};

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;