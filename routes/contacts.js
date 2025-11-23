const express = require("express");
const Contact = require("../models/Contact");

const router = express.Router();

// Get all contacts
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        
        const query = search ? {
            $or: [
                { phoneNumber: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { businessType: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ]
        } : {};

        const contacts = await Contact.find(query)
            .sort({ lastContacted: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Contact.countDocuments(query);

        res.json({
            contacts,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new contact
router.post("/", async (req, res) => {
    try {
        const { phoneNumber, name, businessType, location, tags, notes } = req.body;
        
        const contact = new Contact({
            phoneNumber,
            name,
            businessType,
            location,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            notes
        });

        await contact.save();
        res.json({ success: true, contact });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update contact
router.put("/:id", async (req, res) => {
    try {
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json({ success: true, contact });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete contact
router.delete("/:id", async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Import contacts
router.post("/import", async (req, res) => {
    try {
        const { contacts } = req.body;
        
        if (!Array.isArray(contacts)) {
            return res.status(400).json({ error: 'Contacts must be an array' });
        }

        const results = [];
        for (const contactData of contacts) {
            try {
                const contact = new Contact(contactData);
                await contact.save();
                results.push({ ...contactData, status: 'success' });
            } catch (error) {
                results.push({ ...contactData, status: 'error', error: error.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export contacts
router.get("/export", async (req, res) => {
    try {
        const contacts = await Contact.find().select('-_id -__v');
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts.json');
        res.send(JSON.stringify(contacts, null, 2));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get contact statistics
router.get("/stats", async (req, res) => {
    try {
        const totalContacts = await Contact.countDocuments();
        const contactsByLocation = await Contact.aggregate([
            { $group: { _id: '$location', count: { $sum: 1 } } }
        ]);
        const contactsByBusiness = await Contact.aggregate([
            { $group: { _id: '$businessType', count: { $sum: 1 } } }
        ]);

        res.json({
            totalContacts,
            contactsByLocation,
            contactsByBusiness
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
