const express = require("express");
const { delay } = require("@whiskeysockets/baileys");

const Session = require("./models/Session");
const { whatsappClient } = require("./pair");

let router = express.Router();

// Format phone number
function formatPhoneNumber(number) {
    try {
        const cleaned = number.toString().replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            return '94' + cleaned.substring(1);
        }
        if (cleaned.length === 9) {
            return '94' + cleaned;
        }
        return cleaned;
    } catch (error) {
        return number;
    }
}

// Send Single Message
router.post("/send-message", async (req, res) => {
    try {
        const { number, message } = req.body;
        
        if (!number || !message) {
            return res.json({ 
                success: false, 
                error: 'Number and message are required' 
            });
        }

        const client = whatsappClient();
        
        if (!client || !client.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected. Please connect first using pairing code.' 
            });
        }

        const formattedNumber = formatPhoneNumber(number) + '@s.whatsapp.net';
        
        await client.sendMessage(formattedNumber, { text: message });
        
        // Update last activity and increment message count
        await Session.findOneAndUpdate(
            {},
            { 
                lastActivity: new Date(),
                $inc: { messageCount: 1 }
            },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            message: 'Message sent successfully'
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.json({ 
            success: false, 
            error: 'Failed to send message: ' + error.message 
        });
    }
});

// Bulk Messaging
router.post("/send-bulk", async (req, res) => {
    try {
        const { contacts, message, delayMs = 2000 } = req.body;
        
        if (!contacts || !message) {
            return res.json({ 
                success: false, 
                error: 'Contacts and message are required' 
            });
        }

        const client = whatsappClient();
        
        if (!client || !client.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected' 
            });
        }

        const results = [];
        let successCount = 0;

        for (let i = 0; i < contacts.length; i++) {
            const number = contacts[i];
            try {
                const formattedNumber = formatPhoneNumber(number) + '@s.whatsapp.net';
                await client.sendMessage(formattedNumber, { text: message });
                results.push({ number, status: 'success' });
                successCount++;
                
                // Add delay between messages
                if (i < contacts.length - 1) {
                    await delay(delayMs);
                }
            } catch (error) {
                results.push({ number, status: 'error', error: error.message });
            }
        }

        // Update last activity and message count
        await Session.findOneAndUpdate(
            {},
            { 
                lastActivity: new Date(),
                $inc: { messageCount: successCount }
            },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            results: results,
            sent: successCount,
            failed: contacts.length - successCount,
            message: 'Sent ' + successCount + '/' + contacts.length + ' messages successfully'
        });

    } catch (error) {
        console.error('Bulk send error:', error);
        res.json({ 
            success: false, 
            error: 'Bulk send failed: ' + error.message 
        });
    }
});

// Get Statistics
router.get("/stats", async (req, res) => {
    try {
        const session = await Session.findOne({});
        const client = whatsappClient();
        
        res.json({
            connected: client && client.user,
            phoneNumber: session?.phoneNumber,
            lastActivity: session?.lastActivity,
            totalMessages: session?.messageCount || 0
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

module.exports = router;
