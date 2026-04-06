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

// Web Server: Displays the QR code in a browser tab
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
                <p style="color: #666; margin-top: 20px;">Page auto-refreshes every 15 seconds...</p>
                <script>
                    new QRCode(document.getElementById("qrcode"), {
                        text: "${currentQR}",
                        width: 256,
                        height: 256
                    });
                    setTimeout(() => location.reload(), 15000);
                </script>
            </body>
            </html>
        `);
    } else {
        res.end(`<h2 style="font-family: sans-serif; text-align: center; margin-top: 20vh;">Starting up... Waiting for QR code. Refresh shortly.</h2><script>setTimeout(() => location.reload(), 5000);</script>`);
    }
}).listen(PORT);

mongoose.connect(MONGODB_URI).then(async () => {
    console.log('Database Connected. Starting WhatsApp Client...');
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
                '--single-process', 
                '--disable-gpu',
                '--disable-canvas-aa',
                '--disable-2d-canvas-clip-aa',
                '--disable-gl-drawing-for-tests',
                '--disable-extensions', 
                '--mute-audio'          
            ]
        }
    });

    // --- QR CODE LOGIC ---
    client.on('qr', (qr) => {
        console.log('New QR Code ready! Open your Render app URL in a browser tab to scan it.');
        currentQR = qr; 
    });

    // --- CONNECTION PING ---
    client.on('ready', async () => {
        console.log('WhatsApp Client is Ready!');
        currentQR = "CONNECTED"; 
        
        const myId = client.info.wid._serialized;
        await client.sendMessage(myId, "🟢 *Llama Bot System connected & ready!* Send `!ping` to test.");
    });

    // --- MESSAGE LOGIC ---
    client.on('message_create', async (msg) => {
        const myId = client.info.wid._serialized;
        
        // SECURITY: Ensures it's either flagged as 'fromMe' OR strictly matches your own WhatsApp ID
        const isFromMe = msg.fromMe || msg.from === myId;
        
        if (!isFromMe) return;

        // 1. PING COMMAND
        if (msg.body.toLowerCase() === '!ping') {
            console.log("[DEBUG] Ping command received!");
            await msg.reply("🏓 Pong! The bot is awake, reading your messages, and ready to use !ai.");
            return;
        }

        // 2. AI COMMAND
        if (msg.body.toLowerCase().startsWith('!ai')) {
            console.log(`[DEBUG] !ai command detected! Body: ${msg.body}`);
            
            try {
                const cleanText = msg.body.replace(/!ai/i, '').trim();
                if (!cleanText) {
                    await msg.reply("You need to ask a question! Example: `!ai How do I improve my website?`");
                    return; 
                }

                console.log(`[DEBUG] Sending prompt to OpenAI API...`);
                
                const response = await openai.chat.completions.create({
                    model: "Llama-3.2-11B-Vision-Instruct",
                    messages: [{ role: "user", content: cleanText }],
                });
                
                console.log(`[DEBUG] AI replied successfully! Sending back to WhatsApp.`);
                await msg.reply(response.choices[0].message.content);

            } catch (error) {
                console.error("[DEBUG] AI API Error:", error.message || error);
                await msg.reply(`❌ API Error: ${error.message || "Check Render logs."}`);
            }
        }
    });

    // --- CRASH DETECTOR ---
    // If Puppeteer fails to open Chrome, this will catch it and print the exact reason to your Render Logs.
    client.initialize().catch(err => {
        console.error("\n❌❌❌ PUPPETEER CRASH DETECTED ❌❌❌");
        console.error(err);
        console.error("❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌\n");
    });
});
