const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const http = require('http');

const MONGODB_URI = process.env.MONGODB_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PHONE_NUMBER = process.env.PHONE_NUMBER; // Your new env var
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: GITHUB_TOKEN
});

// Tiny Dummy Server
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Llama Bot Active');
}).listen(PORT);

mongoose.connect(MONGODB_URI).then(async () => {
    console.log('Database Connected. Setting up Pairing Code...');
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 600000 // Save every 10 mins to save RAM
        }),
        puppeteer: {
            headless: true,
            executablePath: './.cache/chrome/linux-146.0.7680.153/chrome-linux64/chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Aggressive RAM saving
                '--disable-gpu',
                '--disable-canvas-aa',
                '--disable-2d-canvas-clip-aa',
                '--disable-gl-drawing-for-tests'
            ]
        }
    });

    // --- PAIRING CODE LOGIC ---
    client.on('qr', async (qr) => {
        // If we have a phone number, request an 8-digit code instead of showing QR
        if (PHONE_NUMBER) {
            try {
                const code = await client.requestPairingCode(PHONE_NUMBER);
                console.log('\n--------------------------------------------');
                console.log('YOUR 8-DIGIT PAIRING CODE IS:', code);
                console.log('--------------------------------------------\n');
            } catch (err) {
                console.error("Pairing code error:", err);
            }
        }
    });

    client.on('ready', async () => {
        console.log('Llama is Online!');
        const myId = client.info.wid._serialized;
        await client.sendMessage(myId, "🚀 *Llama is Online via Pairing Code!*");
    });

    client.on('message_create', async (msg) => {
        if (msg.from !== client.info.wid._serialized || !msg.body.toLowerCase().startsWith('!ai')) return;
        
        try {
            const cleanText = msg.body.replace(/!ai/i, '').trim();
            const response = await openai.chat.completions.create({
                model: "Llama-3.2-11B-Vision-Instruct",
                messages: [{ role: "user", content: [{ type: "text", text: cleanText }] }],
            });
            await msg.reply(response.choices[0].message.content);
        } catch (error) {
            console.error("AI Error:", error);
        }
    });

    client.initialize();
});
