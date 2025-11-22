const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// WhatsApp Client with better configuration
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-client"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

let qrCode = null;
let isConnected = false;

// Auto-generate QR on startup
client.on('qr', async (qr) => {
    console.log('🔄 NEW QR CODE GENERATED');
    qrCode = await qrcode.toDataURL(qr);
    console.log('✅ QR ready for scanning');
});

client.on('ready', () => {
    console.log('🎉 WHATSAPP CONNECTED SUCCESSFULLY!');
    isConnected = true;
    qrCode = null;
});

client.on('authenticated', () => {
    console.log('🔐 AUTHENTICATED');
    isConnected = true;
});

client.on('auth_failure', (msg) => {
    console.log('❌ AUTH FAILED:', msg);
    isConnected = false;
});

client.on('disconnected', (reason) => {
    console.log('📵 DISCONNECTED:', reason);
    isConnected = false;
    // Auto-reconnect
    setTimeout(() => client.initialize(), 5000);
});

// Initialize immediately
console.log('🚀 STARTING WHATSAPP CLIENT...');
client.initialize();

// API Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'running',
        whatsapp: isConnected ? 'connected' : 'disconnected',
        qr_available: !!qrCode,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/qr', (req, res) => {
    if (qrCode) {
        res.json({ success: true, qr: qrCode });
    } else if (isConnected) {
        res.json({ success: true, connected: true, message: 'Already connected' });
    } else {
        res.json({ success: false, message: 'Generating QR... refresh in few seconds' });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        connected: isConnected,
        qr_available: !!qrCode,
        message: isConnected ? 'Ready to send messages!' : 'Please scan QR code'
    });
});

// Send message endpoint
app.post('/api/send', async (req, res) => {
    if (!isConnected) {
        return res.json({ success: false, message: 'WhatsApp not connected' });
    }

    const { number, message } = req.body;
    
    try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await client.sendMessage(chatId, message);
        res.json({ success: true, message: 'Message sent!' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
