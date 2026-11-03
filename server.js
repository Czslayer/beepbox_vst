import express from 'express';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure bundle exists on startup
const editorBundle = path.join(__dirname, 'website', 'beepbox_editor.min.js');
if (!fs.existsSync(editorBundle)) {
  console.log('Building BeepBox assets...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('Failed to build assets on startup:', err);
  }
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'website')));

app.post('/api/client-log', (req, res) => {
  const { type, source, message, details, timestamp } = req.body || {};
  const time = timestamp || new Date().toISOString();
  if (type === 'crash') {
    console.error(`[CLIENT CRASH ${time}] [${source || 'Client'}] ${message}`, details ? JSON.stringify(details) : '');
  } else {
    console.warn(`[CLIENT PERF ${time}] [${type}] [${source || 'Client'}] ${message}`, details ? JSON.stringify(details) : '');
  }
  res.json({ success: true });
});

const SYSTEM_PROMPT = `
You are a world-class AI music composer and music producer for synthesizer and chiptune songs in BeepBox.
Your task is to compose 8 NEW consecutive bars for a new song section (e.g. Chorus 2, Bridge, Solo, Verse 2, Outro) based on existing song context (Key, Scale, Tempo, Channels, and previous section phrasing/motifs/harmonies).

Music Structure Rules:
- Each bar has 16 steps (4 beats x 4 sixteenth-notes per beat). Step 0 is beat 1 start, Step 4 is beat 2, Step 8 is beat 3, Step 12 is beat 4.
- Pitch channels: Pitches are relative scale pitch integers. Index 12 is the octave middle tonic pitch (C/tonic).
  - Common triad chords: Major [12, 16, 19], Minor [12, 15, 19], Power chord [12, 19], Octaves [12, 24].
  - Maintain rhythmic feel, melody contours, call-and-response phrasing, and chord progressions appropriate for the requested section type.
- Drum channels (isNoise: true):
  - Pitches represent percussion instruments: 0 = Kick Drum, 1 = Snare Drum, 2 = Closed Hi-Hat, 3 = Open Hi-Hat, 4 = Crash Cymbal / Tom.
  - Create driving, tight drum patterns (e.g. Kick on steps 0, 8; Snare on steps 4, 12; Hi-Hats on even steps 0, 2, 4, 6, 8, 10, 12, 14).

You MUST return valid JSON matching this exact structure:
{
  "sectionName": "Chorus 2",
  "channels": [
    {
      "channelIndex": 0,
      "bars": [
        {
          "barIndex": 1,
          "notes": [
            {
              "pitches": [12, 16, 19],
              "startStep": 0,
              "durationSteps": 4
            }
          ]
        }
      ]
    }
  ]
}
Generate all 8 bars (barIndex 1 through 8) for each channel specified in the prompt!
`;

const AUTO_SECTION_PROMPT = `
You are an expert AI music producer, audio engineer, and arranger.
Your task is to analyze the entire arrangement and structure of a song (represented by bar indices 0 to totalBars - 1, channel activity, pattern arrangements, note density, drum entry/drop points, harmonic changes, and channel names).

Goal:
Partition and analyze the song into a 3-tier hierarchical structure:
1. Level 1 (Main Sections): Macro song structure (e.g. Intro, Verse 1, Pre-Chorus, Chorus 1, Verse 2, Chorus 2, Bridge, Solo, Drop, Outro).
2. Level 2 (Sub-Sections): Mid-level phrase groupings or structural variations (e.g. Verse 1A, Verse 1B, Build-Up, Drop A, Drop B, Chorus Lead, Post-Chorus).
3. Level 3 (Sub-Sub-Sections): Micro-phrase motifs, fills, or call-and-response figures (e.g. 2-bar Motif, Arp Rise, Bass Drop Fill, Snare Roll, Lead Call, Vocal Burst). Note: Level 3 sections can occasionally overlap or focus on specific 1-2 bar figures.

Rules:
- level = 1 (Main Section): Must cover contiguous blocks from bar 0 to totalBars - 1.
- level = 2 (Sub-Section): Must subdivide or group bars inside the main sections.
- level = 3 (Sub-Sub-Section): Fine-grained 1-2 bar phrase or motif tags.
- startBar and endBar are 0-indexed (inclusive).

Return a JSON object with this exact schema:
{
  "sections": [
    { "startBar": 0, "endBar": 3, "name": "Intro", "level": 1 },
    { "startBar": 4, "endBar": 11, "name": "Verse 1", "level": 1 },
    { "startBar": 0, "endBar": 3, "name": "Intro Arp Motif", "level": 2 },
    { "startBar": 4, "endBar": 7, "name": "Verse 1A (Sparse)", "level": 2 },
    { "startBar": 8, "endBar": 11, "name": "Verse 1B (Full Rhythm)", "level": 2 },
    { "startBar": 0, "endBar": 1, "name": "Lead Motif A", "level": 3 },
    { "startBar": 2, "endBar": 3, "name": "Intro Snare Roll", "level": 3 },
    { "startBar": 10, "endBar": 11, "name": "Bass Fill Transition", "level": 3 }
  ]
}
`;

app.post('/api/generate-section', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) {
      res.status(400).json({ success: false, error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const songContext = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: SYSTEM_PROMPT + '\n\nSong Context and Instruction:\n' + JSON.stringify(songContext, null, 2) }]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.75,
      }
    });

    const responseText = response.text;
    const resultJson = JSON.parse(responseText);
    res.json({ success: true, data: resultJson });
  } catch (err) {
    console.error('Error in /api/generate-section:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate section' });
  }
});

app.post('/api/auto-section-song', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) {
      res.status(400).json({ success: false, error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const fullSongContext = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [{ text: AUTO_SECTION_PROMPT + '\n\nFull Song Arrangement Data:\n' + JSON.stringify(fullSongContext, null, 2) }]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.4,
      }
    });

    const responseText = response.text;
    const resultJson = JSON.parse(responseText);
    res.json({ success: true, data: resultJson });
  } catch (err) {
    console.error('Error in /api/auto-section-song:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to auto-section song' });
  }
});

app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    res.status(404).send('Not found');
    return;
  }
  res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BeepBox server running on http://0.0.0.0:${PORT}`);
});
