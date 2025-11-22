const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    proto,
    getAggregateVotesInPollMessage,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://darkslframexteam_db_user:Mongodb246810@cluster0.cdgkgic.mongodb.net/darkslframex?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔧 Starting WhatsApp Marketing Tool with Baileys...');

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ MongoDB Connected Successfully!');
})
.catch((error) => {
    console.error('❌ MongoDB Connection Failed:', error.message);
});

// Schemas
const sessionSchema = new mongoose.Schema({
    sessionId: String,
    qrCode: String,
    pairingCode: String,
    phoneNumber: String,
    connected: { type: Boolean, default: false },
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

// Generate pairing code
function generatePairingCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

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

// Initialize WhatsApp with Baileys
async function initializeWhatsApp() {
    if (isInitializing) {
        console.log('⚠️ WhatsApp initialization already in progress');
        return;
    }

    try {
        isInitializing = true;
        console.log('🔄 Initializing WhatsApp with Baileys...');

        const sessionId = 'baileys-session-' + Date.now();
        const sessionPath = path.join(SESSION_BASE_PATH, sessionId);

        // Use multi-file auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        // Create socket with proper configuration
        sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino()),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            linkPreviewImageThumbnailWidth: 192,
        });

        // Store credentials updates
        sock.ev.on('creds.update', saveCreds);

        // QR Code Handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code received - Generating...');
                try {
                    const qrData = await qrcode.toDataURL(qr);
                    console.log('✅ QR Code generated');
                    
                    await Session.findOneAndUpdate(
                        {},
                        { 
                            qrCode: qrData, 
                            sessionId: sessionId,
                            lastActivity: new Date() 
                        },
                        { upsert: true }
                    );
                    console.log('💾 QR code saved to database');
                } catch (error) {
                    console.error('❌ QR save error:', error);
                }
            }

            if (connection === 'open') {
                console.log('🎉 WhatsApp CONNECTED!');
                try {
                    await Session.findOneAndUpdate(
                        {},
                        { 
                            connected: true, 
                            qrCode: null,
                            pairingCode: null,
                            lastActivity: new Date() 
                        }
                    );
                    console.log('💾 Database updated: CONNECTED');
                    isInitializing = false;
                } catch (error) {
                    console.error('❌ Database update error:', error);
                }
            }

            if (connection === 'close') {
                console.log('📵 Connection closed');
                isInitializing = false;
                // Auto-reconnect after 10 seconds
                setTimeout(() => {
                    initializeWhatsApp();
                }, 10000);
            }
        });

        // Message handler
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const message = messages[0];
            if (!message.message) return;

            console.log('📨 New message received');
            // Add your message handling logic here
        });

        console.log('🚀 WhatsApp Baileys client initialization started');

    } catch (error) {
        console.error('❌ WhatsApp initialization error:', error);
        isInitializing = false;
    }
}

// Start WhatsApp after MongoDB connection
mongoose.connection.on('connected', () => {
    console.log('🔗 Database connected - Starting WhatsApp in 3 seconds...');
    setTimeout(initializeWhatsApp, 3000);
});

// ==================== API ROUTES ====================

// Status Check
app.get('/api/status', async (req, res) => {
    try {
        const session = await Session.findOne({});
        const isConnected = sock && sock.user;
        
        res.json({
            success: true,
            connected: isConnected ? true : (session ? session.connected : false),
            hasSession: !!session,
            qrAvailable: session ? !!session.qrCode : false,
            pairingCodeAvailable: session ? !!session.pairingCode : false,
            message: isConnected ? 'WhatsApp Connected ✅' : 
                     session?.qrCode ? 'QR Available - Please Scan 📱' : 
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

// Pairing Code
app.get('/api/pairing-code', async (req, res) => {
    try {
        const { number } = req.query;
        
        if (!number) {
            return res.json({ 
                success: false, 
                error: 'Phone number is required' 
            });
        }

        if (!sock) {
            return res.json({
                success: false,
                error: 'WhatsApp client not initialized'
            });
        }

        try {
            const pairingCode = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
            
            await Session.findOneAndUpdate(
                {},
                { 
                    pairingCode: pairingCode,
                    phoneNumber: number,
                    lastActivity: new Date()
                },
                { upsert: true }
            );

            console.log(`📞 Pairing code generated for ${number}: ${pairingCode}`);
            
            res.json({
                success: true,
                pairingCode: pairingCode,
                message: `Enter this code in WhatsApp: ${pairingCode}`,
                instructions: 'Open WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number'
            });

        } catch (error) {
            console.error('Pairing code error:', error);
            res.json({ 
                success: false, 
                error: 'Failed to generate pairing code. Please try QR code instead.' 
            });
        }

    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// New Session
app.post('/api/new-session', async (req, res) => {
    try {
        console.log('🆕 User requested new session');
        
        // Clean up old session files
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

// Send Message (Test Function)
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

// Get Chats
app.get('/api/chats', async (req, res) => {
    try {
        if (!sock || !sock.user) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected' 
            });
        }

        const chats = await sock.fetchBlocklist();
        
        res.json({
            success: true,
            chats: chats || []
        });

    } catch (error) {
        console.error('Get chats error:', error);
        res.json({ 
            success: false, 
            error: 'Failed to get chats' 
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
            qr_available: session ? !!session.qrCode : false,
            pairing_code_available: session ? !!session.pairingCode : false,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            status: 'error',
            error: error.message
        });
    }
});

// Serve simple frontend
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Marketing Tool - Baileys</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 800px; margin: 0 auto; }
            .card { background: #f5f5f5; padding: 20px; margin: 10px 0; border-radius: 10px; }
            button { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; }
            .success { background: #4CAF50; color: white; }
            .primary { background: #2196F3; color: white; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 WhatsApp Marketing Tool (Baileys)</h1>
            <div class="card">
                <h3>Connection Status</h3>
                <div id="status">Loading...</div>
                <button onclick="getStatus()" class="primary">Refresh Status</button>
                <button onclick="newSession()" class="success">New Session</button>
            </div>
            <div class="card">
                <h3>QR Code</h3>
                <button onclick="getQR()">Show QR Code</button>
                <div id="qrcode"></div>
            </div>
            <div class="card">
                <h3>Pairing Code</h3>
                <input type="text" id="phoneNumber" placeholder="94771234567">
                <button onclick="getPairingCode()">Get Pairing Code</button>
                <div id="pairingCode"></div>
            </div>
        </div>
        <script>
            const API_BASE = '/api';
            
            async function getStatus() {
                try {
                    const response = await fetch(API_BASE + '/status');
                    const data = await response.json();
                    document.getElementById('status').innerHTML = 
                        data.success ? \`<strong>Status:</strong> \${data.message}\` : \`Error: \${data.error}\`;
                } catch (error) {
                    document.getElementById('status').innerHTML = 'Error fetching status';
                }
            }
            
            async function getQR() {
                try {
                    const response = await fetch(API_BASE + '/qr');
                    const data = await response.json();
                    if (data.success) {
                        document.getElementById('qrcode').innerHTML = \`<img src="\${data.qr}" alt="QR Code">\`;
                    } else {
                        document.getElementById('qrcode').innerHTML = data.message;
                    }
                } catch (error) {
                    document.getElementById('qrcode').innerHTML = 'Error fetching QR';
                }
            }
            
            async function getPairingCode() {
                const number = document.getElementById('phoneNumber').value;
                if (!number) {
                    alert('Please enter phone number');
                    return;
                }
                try {
                    const response = await fetch(API_BASE + '/pairing-code?number=' + number);
                    const data = await response.json();
                    if (data.success) {
                        document.getElementById('pairingCode').innerHTML = 
                            \`<strong>Pairing Code:</strong> \${data.pairingCode}\`;
                    } else {
                        document.getElementById('pairingCode').innerHTML = 'Error: ' + data.error;
                    }
                } catch (error) {
                    document.getElementById('pairingCode').innerHTML = 'Error fetching pairing code';
                }
            }
            
            async function newSession() {
                try {
                    const response = await fetch(API_BASE + '/new-session', { method: 'POST' });
                    const data = await response.json();
                    alert(data.message);
                    getStatus();
                } catch (error) {
                    alert('Error starting new session');
                }
            }
            
            // Initial load
            getStatus();
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
    console.log(`🔗 Status: http://localhost:${PORT}/api/status`);
    console.log('📱 WhatsApp Marketing Tool with Baileys - READY!');
    console.log('✅ Fixed Baileys Errors');
    console.log('✅ Working QR Codes');
    console.log('✅ Working Pairing Codes');
    console.log('✅ Auto-reconnection');
});
