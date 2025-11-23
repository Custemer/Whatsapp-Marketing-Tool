const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Import routes
const messageRoutes = require('./routes/message');
const campaignRoutes = require('./routes/campaign');
const contactRoutes = require('./routes/contact');

// Use routes
app.use('/api/messages', messageRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);

// Serve the main dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'WhatsApp Marketing API is running',
        timestamp: new Date().toISOString()
    });
});

// Mock WhatsApp connection status
app.get('/api/connection-status', (req, res) => {
    res.json({
        whatsappWeb: true,
        apiConnection: true,
        lastChecked: new Date().toISOString()
    });
});

// Mock analytics data
app.get('/api/analytics', (req, res) => {
    const analytics = {
        messageActivity: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            data: [1200, 900, 1500, 1100, 1300, 800, 600]
        },
        performance: {
            delivered: 14293,
            read: 12864,
            replied: 8560,
            successRate: 94.2
        }
    };
    res.json(analytics);
});

// Mock campaigns data
app.get('/api/campaigns', (req, res) => {
    const campaigns = [
        {
            id: 1,
            name: "Summer Sale 2023",
            status: "active",
            contacts: 1200,
            sent: 1150,
            startDate: "2023-06-15",
            progress: 95
        },
        {
            id: 2,
            name: "New Product Launch",
            status: "active",
            contacts: 2500,
            sent: 2100,
            startDate: "2023-06-20",
            progress: 84
        },
        {
            id: 3,
            name: "Customer Feedback",
            status: "paused",
            contacts: 850,
            sent: 420,
            startDate: "2023-06-10",
            progress: 49
        },
        {
            id: 4,
            name: "Weekly Newsletter",
            status: "draft",
            contacts: 1500,
            sent: 0,
            startDate: null,
            progress: 0
        }
    ];
    res.json(campaigns);
});

// Mock stats data
app.get('/api/stats', (req, res) => {
    const stats = {
        totalContacts: 2847,
        messagesSent: 15293,
        successRate: 94.2,
        activeCampaigns: 12,
        change: {
            contacts: 12,
            messages: 8,
            successRate: 3.2,
            campaigns: -2
        }
    };
    res.json(stats);
});

app.listen(PORT, () => {
    console.log(`WhatsApp Marketing Dashboard running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}`);
});
