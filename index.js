const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');

const MONGODB_URI = process.env.MONGODB_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const openai = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: GITHUB_TOKEN
});

mongoose.connect(MONGODB_URI).then(() => {
    const store = new MongoStore({ mongoose: mongoose });
    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Critical for Render
        }
    });

    client.on('qr', (qr) => {
        console.log('--- SCAN THE QR CODE BELOW ---');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => console.log('Bot is online!'));

    client.on('message', async (msg) => {
        try {
            let content = [];
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                content.push({ type: "image_url", image_url: { url: `data:${media.mimetype};base64,${media.data}` } });
                content.push({ type: "text", text: msg.body || "Analyze this image." });
            } else {
                content.push({ type: "text", text: msg.body });
            }

            const response = await openai.chat.completions.create({
                model: "Llama-3.2-11B-Vision-Instruct",
                messages: [{ role: "user", content: content }],
            });
            msg.reply(response.choices[0].message.content);
        } catch (err) { console.error(err); }
    });
    client.initialize();
});
