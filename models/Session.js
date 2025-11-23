const mongoose = require('mongoose');

// Session Schema
const sessionSchema = new mongoose.Schema({
    sessionId: String,
    phoneNumber: String,
    connected: { type: Boolean, default: false },
    pairingCode: String,
    lastActivity: { type: Date, default: Date.now },
    userData: Object,
    messageCount: { type: Number, default: 0 }
});

// Export the model
module.exports = mongoose.model('Session', sessionSchema);
