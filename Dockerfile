# Use the official Puppeteer image which has Chrome and Linux libraries pre-installed
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to ensure we have permissions to read/write the Mongo auth files
USER root
WORKDIR /app

# Copy package files and install your node modules
COPY package*.json ./
RUN npm install

# Copy all your javascript files
COPY . .

# Start the bot
CMD ["node", "index.js"]
