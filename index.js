import express from 'express';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOUNDS_DIR = path.join(__dirname, 'sounds');

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

const activePlays = new Map();

app.get('/api/sounds', (req, res) => {
    fs.readdir(SOUNDS_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: "Cannot access sound directory" });
        // Return only audio formats
        const audioFiles = files.filter(f => /\.(ogg|wav|mp3|flac)$/i.test(f));
        res.json(audioFiles);
    });
});

app.post('/api/play/:soundName', (req, res) => {
    const { soundName } = req.params;
    const targetFile = path.join(SOUNDS_DIR, `${soundName}`);
    console.log('Playing', targetFile);
    if (!fs.existsSync(targetFile)) {
        return res.status(404).json({ error: "Sound not found" });
    }
    const player = spawn(
        `pw-cat -p --target="TeamSpeak" "${targetFile}"`,
        { shell: true });
    const playId = `${soundName}_${Date.now()}`;
    activePlays.set(playId, player);
    player.on('close', (code) => {
        console.log(`Audio playback finished with code ${code}`);
        activePlays.delete(playId)
    });
    player.stderr.on('data', (data) => {
        console.error(`PipeWire Error: ${data}`);
    });
    return res.status(200).json({ status: 'playing', playId });
});

app.post('/api/stop/:playId', (req, res) => {
    const { playId } = req.params;
    if (activePlays.has(playId)) {
        const player = activePlays.get(playId);
        player.kill('SIGTERM'); // Politely tells Linux to end the sound stream
        activePlays.delete(playId);
        console.log(`Force stopped [${playId}]`);
        return res.status(200).json({ status: 'stopped', playId: playId });
    }
    return res.status(404).json({ error: "Sound is not currently playing or already finished." });
});

app.post('/api/panic', (req, res) => {
    console.log(`🚨 PANIC TRIGGERED! Terminating all ${activePlays.size} active sounds...`);
    // Loop through and kill every active audio process
    for (const [playId, player] of activePlays.entries()) {
        player.kill('SIGTERM');
    }
    activePlays.clear(); // Wipe the tracker clean
    return res.status(200).json({ status: 'all cleared' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Modern ESM Audio API operational at http://localhost:${PORT}`);
});
