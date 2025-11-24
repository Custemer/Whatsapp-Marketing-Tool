const express = require("express");
const { getWhatsAppClient } = require("./pair");
const Contact = require("../models/Contact");
const Category = require("../models/Category");

const router = express.Router();

// Enhanced number detection with auto-categorization
router.post("/detect-active", async (req, res) => {
    try {
        const { 
            numbers, 
            autoCategorize = false,
            categoryName = "Detected Contacts",
            businessType,
            location 
        } = req.body;
        
        if (!numbers || !Array.isArray(numbers)) {
            return res.json({ 
                success: false, 
                error: 'Numbers array is required' 
            });
        }

        const client = getWhatsAppClient();
        
        if (!client || !client.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected' 
            });
        }

        let category = null;
        if (autoCategorize) {
            category = await Category.findOneAndUpdate(
                { name: categoryName },
                { 
                    name: categoryName,
                    description: `Auto-generated category for detected contacts`,
                    filters: {
                        businessType: businessType ? [businessType] : [],
                        location: location ? [location] : []
                    }
                },
                { upsert: true, new: true }
            );
        }

        const results = [];
        let activeCount = 0;
        const activeNumbers = []; // Store active numbers for copying

        for (const number of numbers.slice(0, 100)) {
            try {
                const cleanedNumber = number.replace(/\D/g, '');
                const formattedNumber = cleanedNumber + '@s.whatsapp.net';
                
                // Check if number is on WhatsApp
                const [result] = await client.onWhatsApp(formattedNumber);
                
                if (result && result.exists) {
                    // Get profile info
                    let profileName = null;
                    try {
                        const profile = await client.profilePictureUrl(result.jid);
                        if (profile) {
                            // Try to get status
                            try {
                                const status = await client.fetchStatus(result.jid);
                                profileName = status?.status || null;
                            } catch (statusError) {
                                // Status might not be available
                            }
                        }
                    } catch (error) {
                        // Profile might not be available
                    }
                    
                    const contactData = {
                        phoneNumber: cleanedNumber,
                        name: profileName,
                        status: 'active',
                        whatsappStatus: {
                            isOnWhatsApp: true,
                            lastChecked: new Date(),
                            profileName: profileName
                        },
                        source: 'detection'
                    };
                    
                    // Add category if auto-categorize is enabled
                    if (category) {
                        contactData.categories = [category._id];
                    }
                    
                    if (businessType) {
                        contactData.businessType = businessType;
                    }
                    
                    if (location) {
                        contactData.location = location;
                    }
                    
                    // Save to contacts database
                    const contact = await Contact.findOneAndUpdate(
                        { phoneNumber: cleanedNumber },
                        contactData,
                        { upsert: true, new: true }
                    );
                    
                    results.push({
                        number: cleanedNumber,
                        status: 'active',
                        jid: result.jid,
                        profileName: profileName,
                        contactId: contact._id
                    });
                    activeCount++;
                    
                    // Add to active numbers list for copying
                    activeNumbers.push(cleanedNumber);
                    
                } else {
                    results.push({
                        number: cleanedNumber,
                        status: 'inactive',
                        jid: null
                    });
                }
                
                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                results.push({
                    number: number,
                    status: 'error',
                    error: error.message
                });
            }
        }

        // Update category contact count if category exists
        if (category) {
            await updateCategoryContactCount(category._id);
        }

        res.json({
            success: true,
            results: results,
            total: numbers.length,
            active: activeCount,
            inactive: numbers.length - activeCount,
            activePercentage: ((activeCount / numbers.length) * 100).toFixed(2),
            category: category,
            activeNumbers: activeNumbers, // Return active numbers for copying
            activeNumbersText: activeNumbers.join('\n') // Ready-to-copy text
        });

    } catch (error) {
        console.error('Number detection error:', error);
        res.json({ 
            success: false, 
            error: 'Number detection failed: ' + error.message 
        });
    }
});

// NEW: Get only active numbers from previous detection
router.get("/active-numbers", async (req, res) => {
    try {
        const activeContacts = await Contact.find({ 
            'whatsappStatus.isOnWhatsApp': true,
            status: 'active'
        })
        .select('phoneNumber name')
        .sort({ lastChecked: -1 })
        .limit(200);

        const activeNumbers = activeContacts.map(contact => contact.phoneNumber);
        
        res.json({
            success: true,
            activeNumbers: activeNumbers,
            activeNumbersText: activeNumbers.join('\n'),
            totalActive: activeNumbers.length,
            contacts: activeContacts
        });

    } catch (error) {
        console.error('Get active numbers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// NEW: Export active numbers to file
router.get("/export-active", async (req, res) => {
    try {
        const { format = 'txt' } = req.query;
        
        const activeContacts = await Contact.find({ 
            'whatsappStatus.isOnWhatsApp': true,
            status: 'active'
        })
        .select('phoneNumber name businessType location')
        .sort({ createdAt: -1 });

        let content = '';
        let filename = '';

        if (format === 'csv') {
            // CSV format
            content = 'Phone Number,Name,Business Type,Location\n';
            activeContacts.forEach(contact => {
                content += `${contact.phoneNumber},${contact.name || ''},${contact.businessType || ''},${contact.location || ''}\n`;
            });
            filename = 'active_whatsapp_numbers.csv';
            res.setHeader('Content-Type', 'text/csv');
        } else {
            // TXT format (default)
            content = activeContacts.map(contact => contact.phoneNumber).join('\n');
            filename = 'active_whatsapp_numbers.txt';
            res.setHeader('Content-Type', 'text/plain');
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);

    } catch (error) {
        console.error('Export active numbers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// NEW: Copy active numbers to clipboard (via API)
router.post("/copy-active", async (req, res) => {
    try {
        const { numbers } = req.body;
        
        let activeNumbers = [];
        
        if (numbers && numbers.length > 0) {
            // Use provided numbers
            activeNumbers = Array.isArray(numbers) ? numbers : numbers.split('\n').filter(n => n.trim());
        } else {
            // Get all active numbers from database
            const activeContacts = await Contact.find({ 
                'whatsappStatus.isOnWhatsApp': true,
                status: 'active'
            })
            .select('phoneNumber')
            .limit(500);
            
            activeNumbers = activeContacts.map(contact => contact.phoneNumber);
        }

        const activeNumbersText = activeNumbers.join('\n');
        
        res.json({
            success: true,
            message: `Copied ${activeNumbers.length} active numbers to clipboard`,
            activeNumbers: activeNumbers,
            activeNumbersText: activeNumbersText,
            total: activeNumbers.length
        });

    } catch (error) {
        console.error('Copy active numbers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bulk number detection from file
router.post("/detect-from-file", async (req, res) => {
    try {
        const { 
            fileContent,
            autoCategorize = true,
            categoryName = "Imported Contacts"
        } = req.body;
        
        if (!fileContent) {
            return res.json({ 
                success: false, 
                error: 'File content is required' 
            });
        }

        // Parse numbers from file content (CSV, TXT, etc.)
        const numbers = fileContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                // Extract numbers from CSV lines if needed
                const match = line.match(/(\d+)/);
                return match ? match[1] : line;
            })
            .filter(number => number.length >= 9);

        // Use the existing detection endpoint
        const detectionResult = await detectNumbersWithCategorization(
            numbers, 
            autoCategorize, 
            categoryName
        );

        res.json(detectionResult);

    } catch (error) {
        console.error('File detection error:', error);
        res.json({ 
            success: false, 
            error: 'File detection failed: ' + error.message 
        });
    }
});

// Get detection analytics
router.get("/analytics", async (req, res) => {
    try {
        const totalContacts = await Contact.countDocuments();
        const activeContacts = await Contact.countDocuments({ 
            'whatsappStatus.isOnWhatsApp': true 
        });
        
        const contactsBySource = await Contact.aggregate([
            { $group: { _id: '$source', count: { $sum: 1 } } }
        ]);
        
        const detectionHistory = await Contact.find({ 
            source: 'detection' 
        })
        .sort({ createdAt: -1 })
        .limit(10);

        const recentActivity = await Contact.aggregate([
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } },
            { $limit: 7 }
        ]);

        res.json({
            totalContacts,
            activeContacts,
            inactiveContacts: totalContacts - activeContacts,
            contactsBySource,
            detectionHistory,
            recentActivity,
            detectionSuccessRate: totalContacts > 0 ? 
                ((activeContacts / totalContacts) * 100).toFixed(2) + '%' : '0%'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to update category contact count
async function updateCategoryContactCount(categoryId) {
    const category = await Category.findById(categoryId);
    if (!category) return;
    
    const contactCount = await Contact.countDocuments({ 
        categories: categoryId 
    });
    
    category.contactCount = contactCount;
    await category.save();
}

module.exports = router;
