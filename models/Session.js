const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    sessionId: String,
    phoneNumber: String,
    connected: { type: Boolean, default: false },
    pairingCode: String,
    lastActivity: { type: Date, default: Date.now },
    userData: Object,
    stats: {
        totalMessages: { type: Number, default: 0 },
        totalContacts: { type: Number, default: 0 },
        totalCampaigns: { type: Number, default: 0 },
        successRate: { type: Number, default: 0 }
    }
});

module.exports = mongoose.model('Session', sessionSchema);
