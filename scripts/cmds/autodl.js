const axios = require('axios');
const fs = require('fs');
const path = require('path');

const supportedPlatforms = {
    'youtube': ['youtube.com', 'youtu.be', 'm.youtube.com', 'www.youtube.com', 'youtube-nocookie.com'],
    'tiktok': ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
    'instagram': ['instagram.com', 'www.instagram.com', 'instagr.am', 'm.instagram.com'],
    'facebook': ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'fb.com'],
    'twitter': ['twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'x.com', 'www.x.com'],
    'reddit': ['reddit.com', 'www.reddit.com', 'm.reddit.com', 'redd.it', 'v.redd.it'],
    'vimeo': ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
    'dailymotion': ['dailymotion.com', 'www.dailymotion.com', 'dai.ly']
};

module.exports = {
    config: {
        name: "autodl",
        version: "1.0.3",
        author: "Azadx69x",
        role: 0,
        category: "utility",
        guide: "Paste video link from supported platforms to auto-download"
    },

    onChat: async function({ api, event, message }) {
        const text = event.body || '';
        if (event.senderID === api.getCurrentUserID()) return;
        if (text.startsWith('.') || text.startsWith('!') || text.startsWith('/')) return;

        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return;

        const url = urlMatch[0];
        const platform = detectPlatform(url);
        if (!platform) return;

        await downloadAndSendVideo(api, event, url, platform, message);
    },

    onStart: async function({ api, event, args, message }) {
        if (args[0]) {
            const url = args[0];
            const platform = detectPlatform(url);
            if (platform) {
                await downloadAndSendVideo(api, event, url, platform, message);
            } else {
                await message.reply("❌ Platform not supported\n\nSupported:\n• YouTube\n• TikTok\n• Instagram\n• Facebook\n• Twitter/X\n• Reddit\n• Vimeo\n• Dailymotion");
            }
        } else {
            await message.reply("🔍 Paste video link from:\n\n• YouTube\n• TikTok\n• Instagram\n• Facebook\n• Twitter/X\n• Reddit\n• Vimeo\n• Dailymotion");
        }
    }
};


async function downloadAndSendVideo(api, event, url, platform, message) {
    let processingMsg = null;
    try {
        processingMsg = await message.reply("🧘‍♂️ Preparing Video...");

        const tempDir = path.join(__dirname, 'temp_autodl');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFile = path.join(tempDir, `video_${Date.now()}.mp4`);
        const writer = fs.createWriteStream(tempFile);
      
        const apiUrl = `https://azadx69x-autodl-top.vercel.app/dl?url=${encodeURIComponent(url)}&key=shadowx`;
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': '*/*',
                'Referer': new URL(url).origin
            },
            timeout: 300000,
            maxRedirects: 10
        });

        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('application/json') || contentType.includes('text/html')) {
            const errorData = await streamToString(response.data);
            console.log(`[AUTODL] Error response: ${errorData.substring(0, 200)}`);
            throw new Error('API returned error response');
        }

        let filename = `${platform}_${Date.now()}.mp4`;
        if (response.headers['content-disposition']) {
            const match = response.headers['content-disposition'].match(/filename="(.+?)"/);
            if (match) filename = match[1];
        }

        const contentLength = response.headers['content-length'];
        const totalBytes = parseInt(contentLength) || 0;
        let downloadedBytes = 0;
        response.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
                const percent = Math.round((downloadedBytes / totalBytes) * 100);
                if (percent % 25 === 0) {
                    const currentPercent = Math.floor(percent / 25) * 25;
                    if (currentPercent > 0 && currentPercent <= 100) {
                        api.editMessage(`⏳ Downloading... ${currentPercent}%`, processingMsg.messageID).catch(() => {});
                    }
                }
            }
        });

        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.on('error', reject);
        });

        const stats = fs.statSync(tempFile);
        if (stats.size < 1024) throw new Error('Downloaded file too small');
      
        const infoBox = `╔═════════════════════╗
║         📝 MEDIA INFO      
╠═════════════════════╣
║ ✅ Video downloaded successfully
║ 🎥 Platform: ${platform.charAt(0).toUpperCase() + platform.slice(1)}
║ 💾 ${filename}
║ 🗂️Size: ${formatFileSize(stats.size)}
║ 💫 Made by Azadx69x
╚═════════════════════╝`;
      
        await api.sendMessage({
            body: infoBox,
            attachment: fs.createReadStream(tempFile)
        }, event.threadID);

        if (processingMsg) await api.unsendMessage(processingMsg.messageID);
        fs.unlinkSync(tempFile);

    } catch (error) {
        console.error(`[AUTODL] Error:`, error);
        if (processingMsg) {
            let errorMessage = "❌ Download failed";
            if (error.code === 'ECONNABORTED') errorMessage = "⏰ Timeout (5 minutes) - Video too large";
            else if (error.message.includes('404')) errorMessage = "❌ Video not found or private";
            else if (error.message.includes('API returned error')) errorMessage = "❌ Server error - Try again";
            else if (error.message.includes('too small')) errorMessage = "❌ Invalid video file";

            await api.editMessage(`${errorMessage}\n\nPlatform: ${platform}`, processingMsg.messageID).catch(() => {});
            setTimeout(() => api.unsendMessage(processingMsg.messageID).catch(() => {}), 15000);
        }
    }
}


function detectPlatform(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        for (const [platform, domains] of Object.entries(supportedPlatforms)) {
            if (domains.some(domain => hostname.includes(domain) || url.toLowerCase().includes(domain))) return platform;
        }
    } catch (e) {
        const cleanUrl = url.toLowerCase();
        for (const [platform, domains] of Object.entries(supportedPlatforms)) {
            if (domains.some(domain => cleanUrl.includes(domain))) return platform;
        }
    }
    return null;
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
        stream.on('error', reject);
    });
}
