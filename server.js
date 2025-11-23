const express = require('express');
const qrcode = require('qrcode');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');

// Import Baileys components
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const app = express();

// Simple CORS for Render
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from public directory
app.use(express.static('public'));

// MongoDB Connection for Render
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://darkslframexteam_db_user:Mongodb246810@cluster0.cdgkgic.mongodb.net/darkslframex?retryWrites=true&w=majority&appName=Cluster0';

console.log('Starting WhatsApp Marketing Tool on Render...');

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('MongoDB Connected Successfully!');
})
.catch((error) => {
    console.error('MongoDB Connection Failed:', error.message);
});

// Session Schema
const sessionSchema = new mongoose.Schema({
    sessionId: String,
    sessionData: Object,
    qrCode: String,
    pairingCode: String,
    phoneNumber: String,
    connected: { type: Boolean, default: false },
    connectionType: { type: String, default: 'qr' },
    lastActivity: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);

// Global variables
let sock = null;
let isInitializing = false;
const SESSION_BASE_PATH = './sessions';

// Ensure sessions directory exists
if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Utility Functions
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Browser configuration for Render
const getBrowserConfig = () => {
    if (Browsers.ubuntu) {
        return Browsers.ubuntu('Chrome');
    } else {
        return ['Ubuntu', 'Chrome', '110.0.0.0'];
    }
};

// Initialize WhatsApp
async function initializeWhatsApp() {
    if (isInitializing) {
        console.log('WhatsApp initialization already in progress');
        return;
    }

    try {
        isInitializing = true;
        console.log('Initializing WhatsApp on Render...');

        const sessionId = 'baileys-session-' + Date.now();
        const sessionPath = path.join(SESSION_BASE_PATH, sessionId);

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const browserConfig = getBrowserConfig();
        console.log('Using browser config for Render');

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' }),
            browser: browserConfig,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });

        sock.ev.on('creds.update', saveCreds);

        // Connection Handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            console.log('Connection update:', connection);

            if (qr) {
                console.log('QR Code received');
                try {
                    const qrData = await qrcode.toDataURL(qr);
                    
                    await Session.findOneAndUpdate(
                        {},
                        { 
                            qrCode: qrData, 
                            sessionId: sessionId,
                            connectionType: 'qr',
                            lastActivity: new Date(),
                            connected: false
                        },
                        { upsert: true, new: true }
                    );
                    console.log('QR code saved');
                } catch (error) {
                    console.error('QR save error:', error);
                }
            }

            if (connection === 'open') {
                console.log('WhatsApp CONNECTED SUCCESSFULLY!');
                try {
                    const userPhone = sock.user?.id ? sock.user.id.split(':')[0] : 'Unknown';
                    await Session.findOneAndUpdate(
                        {},
                        { 
                            connected: true, 
                            qrCode: null,
                            pairingCode: null,
                            phoneNumber: userPhone,
                            lastActivity: new Date()
                        },
                        { upsert: true, new: true }
                    );
                    console.log('Database updated: CONNECTED');
                    isInitializing = false;
                } catch (error) {
                    console.error('Database update error:', error);
                }
            }

            if (connection === 'close') {
                console.log('Connection closed');
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('Device logged out, clearing session...');
                    try {
                        await fs.remove(sessionPath);
                    } catch (error) {
                        console.log('No session files to remove');
                    }
                    await Session.deleteMany({});
                }
                
                isInitializing = false;
                console.log('Attempting to reconnect in 10 seconds...');
                setTimeout(() => initializeWhatsApp(), 10000);
            }
        });

        console.log('WhatsApp client initialization started on Render');

    } catch (error) {
        console.error('WhatsApp initialization error:', error);
        isInitializing = false;
        
        console.log('Retrying initialization in 5 seconds...');
        setTimeout(() => initializeWhatsApp(), 5000);
    }
}

// ==================== API ROUTES ====================

// Serve main page
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Marketing Tool</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 15px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #25D366, #128C7E);
                color: white;
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                font-size: 2.5rem;
                margin-bottom: 10px;
            }
            .content {
                padding: 30px;
            }
            .status-card {
                background: #f8f9fa;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 20px;
                border-left: 4px solid #007bff;
            }
            .status-connected {
                border-left-color: #28a745;
                background: #d4edda;
            }
            .status-disconnected {
                border-left-color: #dc3545;
                background: #f8d7da;
            }
            .qr-container {
                text-align: center;
                margin: 20px 0;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 10px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: #333;
            }
            .form-group input, .form-group textarea {
                width: 100%;
                padding: 12px;
                border: 2px solid #e9ecef;
                border-radius: 8px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            .form-group input:focus, .form-group textarea:focus {
                outline: none;
                border-color: #007bff;
            }
            .btn {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                margin: 5px;
                transition: transform 0.2s;
            }
            .btn:hover {
                transform: translateY(-2px);
            }
            .btn-success {
                background: linear-gradient(135deg, #28a745, #1e7e34);
            }
            .btn-danger {
                background: linear-gradient(135deg, #dc3545, #c82333);
            }
            .message-log {
                background: #f8f9fa;
                border-radius: 10px;
                padding: 15px;
                margin-top: 20px;
                max-height: 200px;
                overflow-y: auto;
            }
            .log-entry {
                padding: 8px;
                border-bottom: 1px solid #dee2e6;
                font-family: monospace;
            }
            .tab-container {
                margin-top: 20px;
            }
            .tabs {
                display: flex;
                margin-bottom: 20px;
            }
            .tab {
                padding: 12px 24px;
                background: #f8f9fa;
                border: none;
                cursor: pointer;
                margin-right: 5px;
                border-radius: 8px 8px 0 0;
            }
            .tab.active {
                background: #007bff;
                color: white;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>WhatsApp Marketing Tool</h1>
                <p>Connect and manage your WhatsApp business messages</p>
            </div>
            
            <div class="content">
                <div id="statusCard" class="status-card">
                    <h3>Connection Status</h3>
                    <p id="statusText">Checking status...</p>
                </div>

                <div class="tabs">
                    <button class="tab active" onclick="openTab('connectTab')">Connect</button>
                    <button class="tab" onclick="openTab('messageTab')">Send Messages</button>
                    <button class="tab" onclick="openTab('bulkTab')">Bulk Messages</button>
                </div>

                <div id="connectTab" class="tab-content active">
                    <div class="form-group">
                        <label>Connection Methods:</label>
                        <div style="margin-top: 15px;">
                            <button class="btn" onclick="getQRCode()">Get QR Code</button>
                            <button class="btn" onclick="showPairingInput()">Use Pairing Code</button>
                            <button class="btn btn-danger" onclick="newSession()">New Session</button>
                        </div>
                    </div>

                    <div id="qrContainer" class="qr-container" style="display: none;">
                        <h3>Scan QR Code</h3>
                        <img id="qrImage" src="" alt="QR Code" style="max-width: 300px;">
                        <p>Open WhatsApp -> Settings -> Linked Devices -> Scan QR Code</p>
                    </div>

                    <div id="pairingContainer" style="display: none;">
                        <div class="form-group">
                            <label for="pairingInput">Pairing Code:</label>
                            <input type="text" id="pairingInput" placeholder="Enter pairing code (e.g., 4SHRJQRX)">
                        </div>
                        <div class="form-group">
                            <label for="phoneInput">Phone Number:</label>
                            <input type="text" id="phoneInput" placeholder="94769424903">
                        </div>
                        <button class="btn btn-success" onclick="submitPairing()">Connect with Pairing Code</button>
                    </div>
                </div>

                <div id="messageTab" class="tab-content">
                    <div class="form-group">
                        <label for="singleNumber">Phone Number:</label>
                        <input type="text" id="singleNumber" placeholder="94769424903">
                    </div>
                    <div class="form-group">
                        <label for="singleMessage">Message:</label>
                        <textarea id="singleMessage" placeholder="Type your message here..." style="width: 100%; height: 100px; padding: 12px; border: 2px solid #e9ecef; border-radius: 8px;"></textarea>
                    </div>
                    <button class="btn btn-success" onclick="sendSingleMessage()">Send Message</button>
                </div>

                <div id="bulkTab" class="tab-content">
                    <div class="form-group">
                        <label for="bulkNumbers">Phone Numbers (one per line):</label>
                        <textarea id="bulkNumbers" placeholder="94769424903\n94771234567\n94769874561" style="width: 100%; height: 100px; padding: 12px; border: 2px solid #e9ecef; border-radius: 8px;"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="bulkMessage">Message:</label>
                        <textarea id="bulkMessage" placeholder="Type your bulk message here..." style="width: 100%; height: 100px; padding: 12px; border: 2px solid #e9ecef; border-radius: 8px;"></textarea>
                    </div>
                    <button class="btn btn-success" onclick="sendBulkMessages()">Send Bulk Messages</button>
                </div>

                <div class="message-log">
                    <h4>Activity Log</h4>
                    <div id="logContainer"></div>
                </div>
            </div>
        </div>

        <script>
            let statusCheckInterval;

            function logMessage(message) {
                const logContainer = document.getElementById('logContainer');
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry';
                logEntry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }

            function openTab(tabName) {
                // Hide all tab contents
                const tabContents = document.getElementsByClassName('tab-content');
                for (let i = 0; i < tabContents.length; i++) {
                    tabContents[i].classList.remove('active');
                }

                // Remove active class from all tabs
                const tabs = document.getElementsByClassName('tab');
                for (let i = 0; i < tabs.length; i++) {
                    tabs[i].classList.remove('active');
                }

                // Show the specific tab content
                document.getElementById(tabName).classList.add('active');
                event.currentTarget.classList.add('active');
            }

            async function checkStatus() {
                try {
                    const response = await fetch('/api/status');
                    const data = await response.json();
                    
                    const statusCard = document.getElementById('statusCard');
                    const statusText = document.getElementById('statusText');
                    
                    statusText.textContent = data.message;
                    
                    if (data.connected) {
                        statusCard.className = 'status-card status-connected';
                        logMessage('WhatsApp Connected');
                    } else {
                        statusCard.className = 'status-card status-disconnected';
                        
                        if (data.qrAvailable) {
                            getQRCode();
                        }
                    }
                    
                } catch (error) {
                    logMessage('Error checking status: ' + error.message);
                }
            }

            async function getQRCode() {
                try {
                    const response = await fetch('/api/qr');
                    const data = await response.json();
                    
                    if (data.success) {
                        document.getElementById('qrImage').src = data.qr;
                        document.getElementById('qrContainer').style.display = 'block';
                        document.getElementById('pairingContainer').style.display = 'none';
                        logMessage('QR Code loaded - Please scan');
                    } else {
                        logMessage('QR code generating...');
                    }
                } catch (error) {
                    logMessage('Error getting QR code: ' + error.message);
                }
            }

            function showPairingInput() {
                document.getElementById('pairingContainer').style.display = 'block';
                document.getElementById('qrContainer').style.display = 'none';
            }

            async function submitPairing() {
                const pairingCode = document.getElementById('pairingInput').value;
                const phoneNumber = document.getElementById('phoneInput').value;
                
                if (!pairingCode || !phoneNumber) {
                    alert('Please enter both pairing code and phone number');
                    return;
                }
                
                try {
                    const response = await fetch('/api/input-pairing', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            pairingCode: pairingCode,
                            phoneNumber: phoneNumber
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        logMessage('Pairing code submitted: ' + pairingCode);
                        document.getElementById('pairingContainer').style.display = 'none';
                    } else {
                        logMessage('Pairing error: ' + data.error);
                    }
                } catch (error) {
                    logMessage('Network error: ' + error.message);
                }
            }

            async function newSession() {
                try {
                    const response = await fetch('/api/new-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        logMessage('New session started');
                        document.getElementById('qrContainer').style.display = 'none';
                        document.getElementById('pairingContainer').style.display = 'none';
                    }
                } catch (error) {
                    logMessage('Error starting new session');
                }
            }

            async function sendSingleMessage() {
                const number = document.getElementById('singleNumber').value;
                const message = document.getElementById('singleMessage').value;
                
                if (!number || !message) {
                    alert('Please enter both number and message');
                    return;
                }
                
                try {
                    const response = await fetch('/api/send-message', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            number: number,
                            message: message
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        logMessage('Message sent to ' + number);
                    } else {
                        logMessage('Send failed: ' + data.error);
                    }
                } catch (error) {
                    logMessage('Network error: ' + error.message);
                }
            }

            async function sendBulkMessages() {
                const numbersText = document.getElementById('bulkNumbers').value;
                const message = document.getElementById('bulkMessage').value;
                
                if (!numbersText || !message) {
                    alert('Please enter both numbers and message');
                    return;
                }
                
                const contacts = numbersText.split('\\n').filter(num => num.trim() !== '');
                
                try {
                    const response = await fetch('/api/send-bulk', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            contacts: contacts,
                            message: message,
                            delayMs: 2000
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        logMessage('Bulk messages sent: ' + data.sent + '/' + contacts.length + ' successful');
                    } else {
                        logMessage('Bulk send failed: ' + data.error);
                    }
                } catch (error) {
                    logMessage('Network error: ' + error.message);
                }
            }

            // Start checking status
            statusCheckInterval = setInterval(checkStatus, 3000);
            checkStatus();

            // Initial log
            logMessage('WhatsApp Marketing Tool Started');
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Simple Pairing Code Input
app.post('/api/input-pairing', async (req, res) => {
    try {
        const { pairingCode, phoneNumber } = req.body;

        console.log('Manual pairing input received:', { pairingCode, phoneNumber });

        if (!pairingCode || !phoneNumber) {
            return res.json({
                success: false,
                error: 'Pairing code and phone number are required'
            });
        }

        await Session.findOneAndUpdate(
            {},
            {
                pairingCode: pairingCode.trim().toUpperCase(),
                phoneNumber: formatPhoneNumber(phoneNumber),
                connected: false,
                connectionType: 'pairing',
                lastActivity: new Date(),
                qrCode: null
            },
            { upsert: true, new: true }
        );

        console.log('Pairing code saved to database');

        await initializeWhatsApp();

        res.json({
            success: true,
            message: 'Pairing code received successfully!',
            pairingCode: pairingCode
        });

    } catch (error) {
        console.error('Manual pairing input error:', error);
        res.json({
            success: false,
            error: 'Failed to process pairing code: ' + error.message
        });
    }
});

// Status Check
app.get('/api/status', async (req, res) => {
    try {
        const session = await Session.findOne({});
        const isConnected = sock && sock.user;
        
        res.json({
            success: true,
            connected: isConnected,
            hasSession: !!session,
            qrAvailable: session ? !!session.qrCode : false,
            pairingCodeAvailable: session ? !!session.pairingCode : false,
            message: isConnected ? 'WhatsApp Connected' : 
                     session?.qrCode ? 'QR Available - Please Scan' : 
                     session?.pairingCode ? 'Pairing Code Available' :
                     'Initializing...'
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// QR Code
app.get('/api/qr', async (req, res) => {
    try {
        const session = await Session.findOne({});
        if (session && session.qrCode) {
            res.json({ 
                success: true, 
                qr: session.qrCode,
                message: 'Scan with WhatsApp within 2 minutes'
            });
        } else {
            res.json({ 
                success: false, 
                message: 'QR code generating... Please wait and refresh' 
            });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// New Session
app.post('/api/new-session', async (req, res) => {
    try {
        console.log('User requested new session');
        
        try {
            const files = await fs.readdir(SESSION_BASE_PATH);
            for (const file of files) {
                await fs.remove(path.join(SESSION_BASE_PATH, file));
            }
        } catch (error) {
            console.log('No previous sessions to clean');
        }

        await Session.deleteMany({});
        await initializeWhatsApp();
        
        res.json({ 
            success: true, 
            message: 'New session creation started' 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Send Message
app.post('/api/send-message', async (req, res) => {
    try {
        const { number, message } = req.body;
        
        if (!sock || !sock.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected' 
            });
        }

        if (!number || !message) {
            return res.json({ 
                success: false, 
                error: 'Number and message are required' 
            });
        }

        const formattedNumber = formatPhoneNumber(number) + '@s.whatsapp.net';
        
        await sock.sendMessage(formattedNumber, { text: message });
        
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
app.post('/api/send-bulk', async (req, res) => {
    try {
        const { contacts, message, delayMs = 2000 } = req.body;
        
        if (!sock || !sock.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected' 
            });
        }

        if (!contacts || !message) {
            return res.json({ 
                success: false, 
                error: 'Contacts and message are required' 
            });
        }

        const results = [];
        let successCount = 0;

        for (let i = 0; i < contacts.length; i++) {
            const number = contacts[i];
            try {
                const formattedNumber = formatPhoneNumber(number) + '@s.whatsapp.net';
                await sock.sendMessage(formattedNumber, { text: message });
                results.push({ number, status: 'success' });
                successCount++;
                
                if (i < contacts.length - 1) {
                    await delay(delayMs);
                }
            } catch (error) {
                results.push({ number, status: 'error', error: error.message });
            }
        }

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

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        const session = await Session.findOne({});
        const dbStatus = mongoose.connection.readyState;
        const whatsappStatus = sock && sock.user ? 'connected' : 'disconnected';
        
        res.json({
            status: 'running',
            database: dbStatus === 1 ? 'connected' : 'disconnected',
            whatsapp: whatsappStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            status: 'error',
            error: error.message
        });
    }
});

// Start WhatsApp after MongoDB connection
mongoose.connection.on('connected', () => {
    console.log('Database connected - Starting WhatsApp in 3 seconds...');
    setTimeout(initializeWhatsApp, 3000);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
    console.log('Open: http://localhost:' + PORT);
    console.log('WhatsApp Marketing Tool - READY for Render!');
});
