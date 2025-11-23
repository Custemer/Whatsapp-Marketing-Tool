const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    name: { type: String, required: true },
    message: String,
    imageUrl: String,
    contacts: [String],
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    status: { type: String, default: 'draft' },
    scheduledAt: Date,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Campaign', campaignSchema);
