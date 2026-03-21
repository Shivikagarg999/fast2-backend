const Popup = require('../../models/popup');
const imagekit = require('../../utils/imagekit');

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

exports.createPopup = async (req, res) => {
    try {
        const { startTime, endTime, isActive = true } = req.body;

        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'startTime and endTime are required'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Popup image is required'
            });
        }

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

        let imageUrl;
        try {
            const uploadResult = await imagekit.upload({
                file: req.file.buffer,
                fileName: `popup_${Date.now()}_${req.file.originalname}`,
                folder: '/popups'
            });
            imageUrl = uploadResult.url;
        } catch (uploadError) {
            console.error('Image upload error:', uploadError);
            return res.status(500).json({
                success: false,
                message: 'Failed to upload image',
                error: uploadError.message
            });
        }

        const popup = new Popup({
            imageUrl,
            startTime: start,
            endTime: end,
            isActive,
            createdBy: req.admin?.id || 'system',
            updatedBy: req.admin?.id || 'system'
        });

        await popup.save();

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

exports.getAllPopups = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            isActive
        } = req.query;

        const filter = {};
        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }

        const popups = await Popup.find(filter)
            .sort({ createdAt: -1 })
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

exports.updatePopup = async (req, res) => {
    try {
        const { popupId } = req.params;
        const { startTime, endTime, isActive } = req.body;

        const existingPopup = await Popup.findById(popupId);
        if (!existingPopup) {
            return res.status(404).json({
                success: false,
                message: 'Popup not found'
            });
        }

        if (startTime || endTime) {
            const start = new Date(startTime || existingPopup.startTime);
            const end = new Date(endTime || existingPopup.endTime);

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

        const updateData = {
            ...(startTime && { startTime: new Date(startTime) }),
            ...(endTime && { endTime: new Date(endTime) }),
            ...(isActive !== undefined && { isActive }),
            updatedBy: req.admin?.id || 'system',
            updatedAt: new Date()
        };

        if (req.file) {
            try {
                const uploadResult = await imagekit.upload({
                    file: req.file.buffer,
                    fileName: `popup_${Date.now()}_${req.file.originalname}`,
                    folder: '/popups'
                });
                updateData.imageUrl = uploadResult.url;
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload image',
                    error: uploadError.message
                });
            }
        }

        const popup = await Popup.findByIdAndUpdate(
            popupId,
            updateData,
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
