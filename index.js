const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');

// 1. Load Secrets from Render Environment Variables
const MONGODB_URI = process.env.MONGODB_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// 2. Initialize the Llama 3.2 Vision Brain via GitHub Models
const openai = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: GITHUB_TOKEN
});

// 3. Connect to your MongoDB Database
mongoose.connect(MONGODB_URI).then(() => {
    console.log('Successfully connected to MongoDB memory!');
    
    const store = new MongoStore({ mongoose: mongoose });

    // 4. Configure the WhatsApp Client
    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 // Saves your login every 5 minutes
        }),
        // Low-RAM flags for Render's Free Tier
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    // 5. QR Code Listener (Watch the Render Logs!)
    client.on('qr', (qr) => {
        console.log('--- SCAN THE QR CODE BELOW ---');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('Your WhatsApp Super Brain is now ONLINE!');
    });

    // 6. The Logic: Handling Messages and Images
    client.on('message', async (msg) => {
        try {
            let contentArray = [];
            
            // If you send an image, the bot downloads it and "looks" at it
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                const imageBase64 = `data:${media.mimetype};base64,${media.data}`;
                
                contentArray.push({ 
                    type: "image_url", 
                    image_url: { url: imageBase64 } 
                });
                contentArray.push({ 
                    type: "text", 
                    text: msg.body || "Please describe this image or solve the problem shown." 
                });
            } else {
                // For standard text messages
                contentArray.push({ type: "text", text: msg.body });
            }

            // Send the prompt to the Llama 3.2 Vision Model
            const response = await openai.chat.completions.create({
                model: "Llama-3.2-11B-Vision-Instruct",
                messages: [
                    {
                        role: "user",
                        content: contentArray
                    }
                ],
            });
            
            // Send the AI's reply back to you on WhatsApp
            msg.reply(response.choices[0].message.content);
            
        } catch (error) {
            console.error("Brain Error:", error);
            msg.reply("I had a tiny glitch in my logic. Could you try sending that again?");
        }
    });

    client.initialize();
});
