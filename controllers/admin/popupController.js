const Popup = require('../../models/popup');

// Get active popup
exports.getActivePopup = async (req, res) => {
    try {
        const now = new Date();
        const popup = await Popup.findOne({
            isActive: true,
            startTime: { $lte: now },
            endTime: { $gte: now }
        }).lean();

        res.status(200).json({
            success: true,
            data: popup
        });
    } catch (error) {
        console.error('Get active popup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching popup',
            error: error.message
        });
    }
};

// Create/update popup (Admin only)
exports.createPopup = async (req, res) => {
    try {
        const {
            title,
            message,
            imageUrl,
            startTime,
            endTime,
            isActive = true,
            type = 'info', // info, warning, success, error
            position = 'top-center', // top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
            showCloseButton = true,
            autoCloseAfter = null, // seconds, null for manual close only
            targetPages = [], // empty means all pages
            targetUsers = [], // empty means all users
            priority = 1 // higher number shows first if multiple popups
        } = req.body;

        // Validate required fields
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        // Validate time format
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use ISO format: YYYY-MM-DDTHH:mm:ss'
            });
        }

        if (end <= start) {
            return res.status(400).json({
                success: false,
                message: 'End time must be after start time'
            });
        }

        // Deactivate all existing popups with lower priority
        await Popup.updateMany(
            { 
                isActive: true,
                priority: { $lte: priority }
            },
            { isActive: false }
        );

        // Create or update popup
        const popup = await Popup.findOneAndUpdate(
            {},
            {
                title,
                message,
                imageUrl: imageUrl || null,
                startTime: start,
                endTime: end,
                isActive,
                type,
                position,
                showCloseButton,
                autoCloseAfter,
                targetPages,
                targetUsers,
                priority,
                createdBy: req.admin?.id || 'system',
                updatedBy: req.admin?.id || 'system'
            },
            {
                new: true,
                upsert: true
            }
        );

        res.status(201).json({
            success: true,
            message: 'Popup created successfully',
            data: popup
        });
    } catch (error) {
        console.error('Create popup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating popup',
            error: error.message
        });
    }
};

// Get all popups (Admin only)
exports.getAllPopups = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            isActive,
            type
        } = req.query;

        const filter = {};
        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }
        if (type) {
            filter.type = type;
        }

        const popups = await Popup.find(filter)
            .sort({ priority: -1, createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const total = await Popup.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: popups,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalPopups: total,
                hasNext: parseInt(page) * limit < total,
                hasPrev: parseInt(page) > 1,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get all popups error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching popups',
            error: error.message
        });
    }
};

// Update popup (Admin only)
exports.updatePopup = async (req, res) => {
    try {
        const { popupId } = req.params;
        const updateData = req.body;

        // Validate popup exists
        const existingPopup = await Popup.findById(popupId);
        if (!existingPopup) {
            return res.status(404).json({
                success: false,
                message: 'Popup not found'
            });
        }

        // Validate time format if provided
        if (updateData.startTime || updateData.endTime) {
            const start = new Date(updateData.startTime || existingPopup.startTime);
            const end = new Date(updateData.endTime || existingPopup.endTime);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format. Use ISO format: YYYY-MM-DDTHH:mm:ss'
                });
            }

            if (end <= start) {
                return res.status(400).json({
                    success: false,
                    message: 'End time must be after start time'
                });
            }
        }

        // Update popup
        const popup = await Popup.findByIdAndUpdate(
            popupId,
            {
                ...updateData,
                updatedBy: req.admin?.id || 'system',
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'Popup updated successfully',
            data: popup
        });
    } catch (error) {
        console.error('Update popup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating popup',
            error: error.message
        });
    }
};

// Delete popup (Admin only)
exports.deletePopup = async (req, res) => {
    try {
        const { popupId } = req.params;

        const popup = await Popup.findByIdAndDelete(popupId);
        if (!popup) {
            return res.status(404).json({
                success: false,
                message: 'Popup not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Popup deleted successfully'
        });
    } catch (error) {
        console.error('Delete popup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting popup',
            error: error.message
        });
    }
};

// Toggle popup active status (Admin only)
exports.togglePopup = async (req, res) => {
    try {
        const { popupId } = req.params;

        const popup = await Popup.findById(popupId);
        if (!popup) {
            return res.status(404).json({
                success: false,
                message: 'Popup not found'
            });
        }

        popup.isActive = !popup.isActive;
        popup.updatedBy = req.admin?.id || 'system';
        await popup.save();

        res.status(200).json({
            success: true,
            message: `Popup ${popup.isActive ? 'activated' : 'deactivated'} successfully`,
            data: popup
        });
    } catch (error) {
        console.error('Toggle popup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error toggling popup',
            error: error.message
        });
    }
};
