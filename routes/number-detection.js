const express = require("express");
const { getWhatsAppClient } = require("./pair");
const Contact = require("../models/Contact");

const router = express.Router();

// Detect active WhatsApp numbers from a list
router.post("/detect-active", async (req, res) => {
    try {
        const { numbers } = req.body;
        
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

        const results = [];
        let activeCount = 0;

        for (const number of numbers) {
            try {
                const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';
                
                // Check if number is on WhatsApp by trying to get their profile
                const [result] = await client.onWhatsApp(formattedNumber);
                
                if (result && result.exists) {
                    results.push({
                        number: number,
                        status: 'active',
                        jid: result.jid
                    });
                    activeCount++;
                    
                    // Save to contacts database
                    await Contact.findOneAndUpdate(
                        { phoneNumber: number },
                        {
                            phoneNumber: number,
                            status: 'active',
                            lastChecked: new Date()
                        },
                        { upsert: true, new: true }
                    );
                } else {
                    results.push({
                        number: number,
                        status: 'inactive',
                        jid: null
                    });
                }
                
                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                results.push({
                    number: number,
                    status: 'error',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            results: results,
            total: numbers.length,
            active: activeCount,
            inactive: numbers.length - activeCount,
            activePercentage: ((activeCount / numbers.length) * 100).toFixed(2)
        });

    } catch (error) {
        console.error('Number detection error:', error);
        res.json({ 
            success: false, 
            error: 'Number detection failed: ' + error.message 
        });
    }
});

// Detect numbers by location pattern (Sri Lanka)
router.post("/detect-by-location", async (req, res) => {
    try {
        const { areaCodes = ['94'], numberPatterns = [] } = req.body;
        
        const client = getWhatsAppClient();
        
        if (!client || !client.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected' 
            });
        }

        // Generate numbers based on patterns
        const generatedNumbers = generateNumbersByPattern(areaCodes, numberPatterns);
        const results = [];
        let activeCount = 0;

        for (const number of generatedNumbers.slice(0, 100)) { // Limit to 100 for demo
            try {
                const formattedNumber = number + '@s.whatsapp.net';
                const [result] = await client.onWhatsApp(formattedNumber);
                
                if (result && result.exists) {
                    results.push({
                        number: number,
                        status: 'active',
                        jid: result.jid,
                        location: detectLocationFromNumber(number)
                    });
                    activeCount++;
                    
                    // Save to contacts
                    await Contact.findOneAndUpdate(
                        { phoneNumber: number },
                        {
                            phoneNumber: number,
                            status: 'active',
                            location: detectLocationFromNumber(number),
                            lastChecked: new Date()
                        },
                        { upsert: true, new: true }
                    );
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                results.push({
                    number: number,
                    status: 'error',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            results: results,
            totalChecked: generatedNumbers.length,
            activeFound: activeCount
        });

    } catch (error) {
        console.error('Location detection error:', error);
        res.json({ 
            success: false, 
            error: 'Location detection failed: ' + error.message 
        });
    }
});

// Helper function to generate numbers by pattern
function generateNumbersByPattern(areaCodes, patterns) {
    const numbers = [];
    
    areaCodes.forEach(areaCode => {
        patterns.forEach(pattern => {
            // Generate variations based on pattern
            for (let i = 0; i < 100; i++) {
                let number = areaCode;
                
                // Replace X with random digits
                pattern.split('').forEach(char => {
                    if (char === 'X') {
                        number += Math.floor(Math.random() * 10);
                    } else {
                        number += char;
                    }
                });
                
                numbers.push(number);
            }
        });
    });
    
    return numbers;
}

// Helper function to detect location from number
function detectLocationFromNumber(number) {
    const areaCodes = {
        '11': 'Colombo',
        '21': 'Kalutara',
        '23': 'Panadura',
        '24': 'Mathugama',
        '25': 'Beruwala',
        '26': 'Horana',
        '31': 'Gampaha',
        '33': 'Negombo',
        '34': 'Kelaniya',
        '36': 'Gampaha',
        '38': 'Wattala',
        '41': 'Matara',
        '42': 'Hambantota',
        '43': 'Tangalle',
        '44': 'Beliatta',
        '45': 'Ambalantota',
        '46': 'Tissamaharama',
        '47': 'Kataragama',
        '51': 'Galle',
        '52': 'Ambalangoda',
        '53': 'Hikkaduwa',
        '54': 'Elpitiya',
        '55': 'Baddegama',
        '57': 'Karapitiya',
        '63': 'Ratnapura',
        '65': 'Kegalle',
        '66': 'Kandy',
        '67': 'Matale',
        '68': 'Nuwara Eliya',
        '71': 'Anuradhapura',
        '72': 'Polonnaruwa',
        '73': 'Badulla',
        '74': 'Monaragala',
        '75': 'Trincomalee',
        '76': 'Batticaloa',
        '77': 'Ampara',
        '78': 'Jaffna',
        '81': 'Kurunegala',
        '82': 'Puttalam',
        '86': 'Chilaw'
    };
    
    const areaCode = number.substring(2, 4);
    return areaCodes[areaCode] || 'Unknown';
}

// Get detection statistics
router.get("/stats", async (req, res) => {
    try {
        const totalContacts = await Contact.countDocuments();
        const activeContacts = await Contact.countDocuments({ status: 'active' });
        const contactsByLocation = await Contact.aggregate([
            { $group: { _id: '$location', count: { $sum: 1 } } }
        ]);
        
        const recentDetections = await Contact.find()
            .sort({ lastChecked: -1 })
            .limit(10);

        res.json({
            totalContacts,
            activeContacts,
            inactiveContacts: totalContacts - activeContacts,
            contactsByLocation,
            recentDetections
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
