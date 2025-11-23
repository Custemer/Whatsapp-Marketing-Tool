const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Campaign = require("../models/Campaign");
const { getWhatsAppClient } = require("./pair");

const router = express.Router();

// Configure multer for campaign images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './uploads/campaigns';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Get all campaigns
router.get("/", async (req, res) => {
    try {
        const campaigns = await Campaign.find().sort({ createdAt: -1 });
        res.json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new campaign
router.post("/", upload.single('image'), async (req, res) => {
    try {
        const { name, message, contacts } = req.body;
        const image = req.file;

        const campaign = new Campaign({
            name,
            message,
            contacts: Array.isArray(contacts) ? contacts : contacts.split('\n').filter(num => num.trim() !== ''),
            imageUrl: image ? `/uploads/campaigns/${image.filename}` : null
        });

        await campaign.save();
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Execute campaign
router.post("/:id/execute", async (req, res) => {
    try {
        const client = getWhatsAppClient();
        
        if (!client || !client.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected' 
            });
        }

        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) {
            return res.json({ success: false, error: 'Campaign not found' });
        }

        let sent = 0;
        let failed = 0;
        const results = [];

        for (const number of campaign.contacts) {
            try {
                const formattedNumber = number + '@s.whatsapp.net';
                
                let messageOptions = { text: campaign.message };
                
                if (campaign.imageUrl) {
                    messageOptions = {
                        image: { url: path.join(__dirname, '..', campaign.imageUrl) },
                        caption: campaign.message
                    };
                }
                
                await client.sendMessage(formattedNumber, messageOptions);
                sent++;
                results.push({ number, status: 'success' });
                
                // Add delay
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                failed++;
                results.push({ number, status: 'error', error: error.message });
            }
        }

        // Update campaign status
        campaign.sent = sent;
        campaign.failed = failed;
        campaign.status = 'completed';
        await campaign.save();

        res.json({
            success: true,
            sent,
            failed,
            results,
            message: `Campaign executed: ${sent} sent, ${failed} failed`
        });

    } catch (error) {
        console.error('Campaign execution error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Delete campaign
router.delete("/:id", async (req, res) => {
    try {
        await Campaign.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
