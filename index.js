const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');
const http = require('http');

// 1. Secrets from Render Environment Variables
const MONGODB_URI = process.env.MONGODB_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PORT = process.env.PORT || 3000; 

// 2. Initialize the Llama 3.2 Vision Brain
const openai = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: GITHUB_TOKEN
});

// 3. THE DUMMY SERVER: This keeps Render happy and "Green"
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write('Bot is Online!');
    res.end();
}).listen(PORT);

// 4. Connect to MongoDB Memory
mongoose.connect(MONGODB_URI).then(() => {
    console.log('Memory Connected! Starting WhatsApp Brain...');
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 
        }),
        puppeteer: {
            headless: true,
            executablePath: './.cache/chrome/linux-146.0.7680.153/chrome-linux64/chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        }
    });

    // 5. THE MAGIC LINK: This creates the small, scannable QR link
    client.on('qr', (qr) => {
        console.log('\n--- SCAN THIS LINK FOR A PERFECT SCAN ---');
        console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
        console.log('-------------------------------------------\n');
        
        // Also prints the terminal version just in case
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('Your WhatsApp Super Brain is now ONLINE and ready for messages!');
    });

    // 6. The Logic: Handling Messages and Diagrams
    client.on('message', async (msg) => {
        // Stop the bot from replying to its own messages!
        if (msg.fromMe) return;

        try {
            let contentArray = [];
            
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                contentArray.push({ type: "image_url", image_url: { url: `data:${media.mimetype};base64,${media.data}` } });
                contentArray.push({ type: "text", text: msg.body || "Analyze this image." });
            } else {
                contentArray.push({ type: "text", text: msg.body });
            }

            const response = await openai.chat.completions.create({
                model: "Llama-3.2-11B-Vision-Instruct",
                messages: [{ role: "user", content: contentArray }],
            });
            
            msg.reply(response.choices[0].message.content);
            
        } catch (error) {
            console.error("AI Brain Error:", error);
        }
    });

    client.initialize();
});
