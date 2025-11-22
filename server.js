const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isConnected = false;
let qrCode = null;

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.emit('status', { connected: isConnected });

    if (qrCode) {
        socket.emit('qr', qrCode);
    }

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// WhatsApp Events
client.on('qr', async (qr) => {
    console.log('QR Code received');
    qrCode = await qrcode.toDataURL(qr);
    io.emit('qr', qrCode);
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    isConnected = true;
    qrCode = null;
    io.emit('status', { connected: true });
    io.emit('message', 'WhatsApp connected successfully!');
});

client.on('disconnected', () => {
    console.log('WhatsApp client disconnected');
    isConnected = false;
    io.emit('status', { connected: false });
    io.emit('message', 'WhatsApp disconnected');
});

// API Routes
app.get('/api/status', (req, res) => {
    res.json({ connected: isConnected });
});

app.post('/api/send-message', async (req, res) => {
    if (!isConnected) {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }

    const { number, message } = req.body;

    try {
        const chatId = number.substring(1) + '@c.us';
        await client.sendMessage(chatId, message);
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/send-bulk', async (req, res) => {
    if (!isConnected) {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }

    const { contacts, message, delay = 5000 } = req.body;

    try {
        const results = [];
        
        for (let i = 0; i < contacts.length; i++) {
            const number = contacts[i];
            
            try {
                const chatId = number.substring(1) + '@c.us';
                await client.sendMessage(chatId, message);
                results.push({ number, status: 'success' });
                
                // Emit progress
                io.emit('progress', {
                    current: i + 1,
                    total: contacts.length,
                    percentage: ((i + 1) / contacts.length) * 100
                });
                
                // Delay between messages
                if (i < contacts.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (error) {
                results.push({ number, status: 'error', error: error.message });
            }
        }
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    client.initialize();
});
