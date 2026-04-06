const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const http = require('http');

const MONGODB_URI = process.env.MONGODB_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: GITHUB_TOKEN
});

let currentQR = ""; 

// Web Server
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    
    if (currentQR === "CONNECTED") {
        res.end(`<h2 style="font-family: sans-serif; text-align: center; margin-top: 20vh;">✅ Llama Bot is Active and Connected!</h2>`);
    } else if (currentQR) {
        res.end(`
            <html>
            <head>
                <title>WhatsApp QR Auth</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            </head>
            <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background-color: #f0f2f5;">
                <h2>Scan with WhatsApp to link your bot</h2>
                <div id="qrcode" style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
                <script>
                    new QRCode(document.getElementById("qrcode"), { text: "${currentQR}", width: 256, height: 256 });
                    setTimeout(() => location.reload(), 15000);
                </script>
            </body>
            </html>
        `);
    } else {
        res.end(`<h2 style="font-family: sans-serif; text-align: center; margin-top: 20vh;">Starting up... Waiting for Chrome to launch. Refresh shortly.</h2><script>setTimeout(() => location.reload(), 5000);</script>`);
    }
}).listen(PORT);

mongoose.connect(MONGODB_URI).then(async () => {
    console.log('Database Connected. Starting WhatsApp Client...');
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 600000 
        }),
        puppeteer: {
            headless: true,
            // Automatically uses the Chrome installed inside the Docker container
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', 
                '--disable-gpu',
                '--mute-audio'          
            ]
        }
    });

    client.on('qr', (qr) => {
        console.log('New QR Code ready! Open your Render app URL to scan it.');
        currentQR = qr; 
    });

    client.on('ready', async () => {
        console.log('WhatsApp Client is Ready!');
        currentQR = "CONNECTED"; 
        const myId = client.info.wid._serialized;
        await client.sendMessage(myId, "🟢 *Llama Bot System connected & ready!* Send `!ping` to test.");
    });

    client.on('message_create', async (msg) => {
        const myId = client.info.wid._serialized;
        const isFromMe = msg.fromMe || msg.from === myId;
        
        if (!isFromMe) return;

        if (msg.body.toLowerCase() === '!ping') {
            await msg.reply("🏓 Pong! The bot is awake and running on Docker.");
            return;
        }

        if (msg.body.toLowerCase().startsWith('!ai')) {
            try {
                const cleanText = msg.body.replace(/!ai/i, '').trim();
                if (!cleanText) return; 

                const response = await openai.chat.completions.create({
                    model: "Llama-3.2-11B-Vision-Instruct",
                    messages: [{ role: "user", content: cleanText }],
                });
                await msg.reply(response.choices[0].message.content);
            } catch (error) {
                console.error("AI Error:", error.message);
                await msg.reply(`❌ API Error: ${error.message}`);
            }
        }
    });

    client.initialize().catch(console.error);
});
