const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');
const http = require('http');

// 1. Setup Environment Variables
const MONGODB_URI = process.env.MONGODB_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PORT = process.env.PORT || 3000; 

// 2. Initialize Llama 3.2 Vision Model
const openai = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: GITHUB_TOKEN
});

// 3. Create Dummy Server (Stops Render from timing out)
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write('Llama Bot is Active');
    res.end();
}).listen(PORT);

// 4. Connect to MongoDB and Start Bot
mongoose.connect(MONGODB_URI).then(() => {
    console.log('Database Connected. Booting Llama...');
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 
        }),
        puppeteer: {
            headless: true,
            // Path specifically for Render's Linux environment
            executablePath: './.cache/chrome/linux-146.0.7680.153/chrome-linux64/chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        }
    });

    // 5. QR Code Handling (Magic Link included)
    client.on('qr', (qr) => {
        console.log('\n--- CLICK THIS LINK FOR A SMALL SCANNABLE QR ---');
        console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
        console.log('------------------------------------------------\n');
        qrcode.generate(qr, { small: true });
    });

    // 6. Startup Notification (Sends message to YOU)
    client.on('ready', async () => {
        console.log('Llama is Online!');
        try {
            const myId = client.info.wid._serialized;
            await client.sendMessage(myId, "🚀 *Llama is Online and Private!*\nI will only respond to you when you type *!ai* in this chat.");
        } catch (err) {
            console.error("Startup message failed:", err);
        }
    });

    // 7. Core Logic: Private, Trigger-Based AI
    client.on('message_create', async (msg) => {
        // SECURITY: Only process messages in your "Message Yourself" chat
        if (msg.from !== client.info.wid._serialized) return;

        // TRIGGER: Only respond if the message starts with !ai
        if (!msg.body.toLowerCase().startsWith('!ai')) return;

        // LOOP PROTECTOR: Don't reply to the bot's own AI responses
        if (msg.hasQuotedMsg || msg.body.includes("Llama is Online")) return;

        try {
            // Remove "!ai" from the text before sending it to the model
            const cleanText = msg.body.replace(/!ai/i, '').trim();
            
            let contentArray = [];
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                contentArray.push({ 
                    type: "image_url", 
                    image_url: { url: `data:${media.mimetype};base64,${media.data}` } 
                });
                contentArray.push({ type: "text", text: cleanText || "Describe this image." });
            } else {
                contentArray.push({ type: "text", text: cleanText });
            }

            const response = await openai.chat.completions.create({
                model: "Llama-3.2-11B-Vision-Instruct",
                messages: [{ role: "user", content: contentArray }],
            });
            
            // Send the AI answer back as a reply
            await msg.reply(response.choices[0].message.content);

        } catch (error) {
            console.error("AI Error:", error);
        }
    });

    client.initialize();
});
