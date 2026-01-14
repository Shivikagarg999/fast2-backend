const Contact = require('../../models/contact');

const submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !phone || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit phone number'
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const duplicate = await Contact.findOne({
      email,
      message: { $regex: new RegExp(message.substring(0, 50), 'i') },
      createdAt: { $gte: oneHourAgo }
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate submission detected. Please wait before submitting again.'
      });
    }

    const contact = new Contact({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      subject: subject.trim(),
      message: message.trim(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      source: 'website',
      tags: [subject.toLowerCase().replace(' ', '-')]
    });

    await contact.save();
    res.status(201).json({
      success: true,
      message: 'Your message has been received! We will get back to you soon.',
      data: {
        id: contact._id,
        referenceNumber: `CONTACT-${contact._id.toString().substring(18, 24).toUpperCase()}`,
        submittedAt: contact.createdAt
      }
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit contact form. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getAllContacts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      subject,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    if (subject && subject !== 'all') {
      query.subject = subject;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const contacts = await Contact.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('assignedTo', 'name email')
      .lean();

    const total = await Contact.countDocuments(query);

    res.status(200).json({
      success: true,
      data: contacts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      },
      filters: {
        statuses: await Contact.distinct('status'),
        priorities: await Contact.distinct('priority'),
        subjects: await Contact.distinct('subject')
      }
    });

  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact submissions'
    });
  }
};

const getContactById = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('assignedTo', 'name email role');

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact submission not found'
      });
    }

    res.status(200).json({
      success: true,
      data: contact
    });

  } catch (error) {
    console.error('Error fetching contact:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact submission'
    });
  }
};

const updateContactStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, assignedTo, tags, response } = req.body;

    const contact = await Contact.findById(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact submission not found'
      });
    }

    if (status) {
      contact.status = status;
      
      if (status === 'resolved' && response) {
        contact.response = response;
        contact.respondedAt = new Date();
        contact.assignedTo = req.user?.id || assignedTo;
      }
    }

    if (priority) {
      contact.priority = priority;
    }

    if (assignedTo) {
      contact.assignedTo = assignedTo;
      contact.status = 'in-progress';
    }

    if (tags && Array.isArray(tags)) {
      contact.tags = [...new Set([...contact.tags, ...tags])];
    }

    await contact.save();

    res.status(200).json({
      success: true,
      message: 'Contact submission updated successfully',
      data: contact
    });

  } catch (error) {
    console.error('Error updating contact:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update contact submission'
    });
  }
};

const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact submission not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact submission deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete contact submission'
    });
  }
};

const getContactStats = async (req, res) => {
  try {
    const total = await Contact.countDocuments();
    const pending = await Contact.countDocuments({ status: 'pending' });
    const read = await Contact.countDocuments({ status: 'read' });
    const inProgress = await Contact.countDocuments({ status: 'in-progress' });
    const resolved = await Contact.countDocuments({ status: 'resolved' });

    const last7Days = await Contact.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 },
          highPriority: {
            $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] }
          }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          date: "$_id",
          count: 1,
          highPriority: 1,
          _id: 0
        }
      }
    ]);

    const bySubject = await Contact.aggregate([
      {
        $group: {
          _id: "$subject",
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: {
              $cond: [
                { $eq: ["$status", "resolved"] },
                { $subtract: ["$respondedAt", "$createdAt"] },
                null
              ]
            }
          }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $project: {
          subject: "$_id",
          count: 1,
          avgResponseTime: {
            $divide: ["$avgResponseTime", 1000 * 60 * 60] 
          },
          _id: 0
        }
      }
    ]);
    const priorityStats = await Contact.aggregate([
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
          unresolved: {
            $sum: { $cond: [{ $ne: ["$status", "resolved"] }, 1, 0] }
          }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const responseStats = await Contact.aggregate([
      {
        $match: {
          status: "resolved",
          respondedAt: { $exists: true },
          createdAt: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          avgResponseHours: {
            $avg: {
              $divide: [
                { $subtract: ["$respondedAt", "$createdAt"] },
                1000 * 60 * 60
              ]
            }
          },
          minResponseHours: {
            $min: {
              $divide: [
                { $subtract: ["$respondedAt", "$createdAt"] },
                1000 * 60 * 60
              ]
            }
          },
          maxResponseHours: {
            $max: {
              $divide: [
                { $subtract: ["$respondedAt", "$createdAt"] },
                1000 * 60 * 60
              ]
            }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        counts: {
          total,
          pending,
          read,
          inProgress,
          resolved,
          unresolved: pending + read + inProgress
        },
        last7Days,
        bySubject,
        priorityStats,
        responseTime: responseStats[0] || {
          avgResponseHours: 0,
          minResponseHours: 0,
          maxResponseHours: 0
        },
        recentActivity: await Contact.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .select('name email subject status createdAt')
      }
    });

  } catch (error) {
    console.error('Error fetching contact stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact statistics'
    });
  }
};

const exportContacts = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    
    const query = {};
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .select('name email phone subject message status priority createdAt respondedAt response')
      .lean();

    const headers = [
      'Name',
      'Email',
      'Phone',
      'Subject',
      'Message',
      'Status',
      'Priority',
      'Submitted At',
      'Responded At',
      'Response'
    ];

    const csvRows = contacts.map(contact => [
      `"${contact.name.replace(/"/g, '""')}"`,
      `"${contact.email}"`,
      `"${contact.phone}"`,
      `"${contact.subject}"`,
      `"${contact.message.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ')}"`,
      `"${contact.status}"`,
      `"${contact.priority}"`,
      `"${new Date(contact.createdAt).toLocaleString()}"`,
      contact.respondedAt ? `"${new Date(contact.respondedAt).toLocaleString()}"` : '""',
      contact.response ? `"${contact.response.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ')}"` : '""'
    ]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts_export.csv');
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export contacts'
    });
  }
};

module.exports = {
  submitContact,
  getAllContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
  getContactStats,
  exportContacts
};