const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS Configuration
app.use(cors({
    origin: ["https://whatsapp-marketing-tool.vercel.app", "http://localhost:3000"],
    credentials: true
}));

// Socket.io Configuration with CORS
const io = socketIo(server, {
    cors: {
        origin: ["https://whatsapp-marketing-tool.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true,
        transports: ['websocket', 'polling']
    },
    allowEIO3: true
});

// Middleware
app.use(express.json());

// WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

let isConnected = false;
let qrCode = null;
let connectedClients = new Set();

// Socket.io Connection with better handling
io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    connectedClients.add(socket.id);
    
    // Send current status immediately
    socket.emit('status', { 
        connected: isConnected, 
        message: isConnected ? 'WhatsApp Connected' : 'WhatsApp Not Connected'
    });

    // Send QR code if exists
    if (qrCode) {
        console.log('📤 Sending existing QR to client:', socket.id);
        socket.emit('qr', qrCode);
        socket.emit('message', 'QR code available - please scan with WhatsApp');
    }

    socket.on('disconnect', (reason) => {
        console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
        connectedClients.delete(socket.id);
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error:', socket.id, error);
    });

    // Test event
    socket.emit('welcome', { 
        message: 'Connected to WhatsApp Marketing Server',
        timestamp: new Date().toISOString()
    });
});

// WhatsApp Events
client.on('qr', async (qr) => {
    console.log('📱 QR Code received - Generating...');
    try {
        qrCode = await qrcode.toDataURL(qr);
        console.log('✅ QR Code generated successfully');
        console.log('📤 Broadcasting QR to', connectedClients.size, 'clients');
        
        // Broadcast to all connected clients
        io.emit('qr', qrCode);
        io.emit('message', 'QR code generated - please scan with WhatsApp');
    } catch (error) {
        console.error('❌ QR Code generation failed:', error);
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
    isConnected = true;
    qrCode = null;
    
    io.emit('status', { 
        connected: true, 
        message: 'WhatsApp Connected - Ready to send messages!' 
    });
    io.emit('message', '✅ WhatsApp connected successfully!');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated');
    io.emit('message', '🔐 WhatsApp authenticated successfully');
});

client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp auth failure:', msg);
    io.emit('message', '❌ WhatsApp authentication failed: ' + msg);
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp disconnected:', reason);
    isConnected = false;
    io.emit('status', { 
        connected: false, 
        message: 'WhatsApp Disconnected: ' + reason 
    });
    io.emit('message', '❌ WhatsApp disconnected: ' + reason);
});

// API Routes for testing
app.get('/api/status', (req, res) => {
    res.json({ 
        success: true,
        connected: isConnected, 
        message: isConnected ? 'WhatsApp Connected' : 'WhatsApp Not Connected',
        qrAvailable: !!qrCode,
        connectedClients: connectedClients.size,
        serverTime: new Date().toISOString()
    });
});

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'WhatsApp Marketing Backend is working!',
        version: '2.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        whatsapp: isConnected ? 'connected' : 'disconnected',
        qr: qrCode ? 'available' : 'not available',
        clients: connectedClients.size
    });
});

// Initialize WhatsApp Client
console.log('🚀 Initializing WhatsApp client...');
client.initialize().catch(error => {
    console.error('❌ WhatsApp initialization failed:', error);
});

// Start server - Render requires specific port binding
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔗 Health check: https://whatsapp-marketing-backend.onrender.com/api/health`);
    console.log(`🔗 Test endpoint: https://whatsapp-marketing-backend.onrender.com/api/test`);
    console.log(`🔗 Status endpoint: https://whatsapp-marketing-backend.onrender.com/api/status`);
});
