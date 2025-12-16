const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  permissions: {
    type: [String],
    default: [],
  },
  isSystem: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;