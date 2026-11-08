/**
 * Generates the narration for a tutorial video with ElevenLabs.
 *
 *   node --env-file=.env.local scripts/tutorial/voiceover.mjs <narration.json> <out-dir> [id ...]
 *
 * `narration.json` maps a line id to its text. Each line becomes `<out-dir>/<id>.mp3`, and its length
 * in seconds is written to `<out-dir>/durations.json`, which the recording script uses to wait for the
 * voice before acting. A line that already has an mp3 is never generated again: every request is
 * billed by the character.
 *
 * The key is read from ELEVENLABS_API_KEY by the SDK and is never written into code.
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [, , narrationPath, outDir, ...only] = process.argv;
if (!narrationPath || !outDir) {
  console.error("usage: voiceover.mjs <narration.json> <out-dir> [id ...]");
  process.exit(1);
}

const VOICE = process.env.TUTORIAL_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";
const MODEL = process.env.TUTORIAL_MODEL_ID ?? "eleven_v4";

const lines = JSON.parse(fs.readFileSync(narrationPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const durationsPath = path.join(outDir, "durations.json");
const durations = fs.existsSync(durationsPath) ? JSON.parse(fs.readFileSync(durationsPath, "utf8")) : {};

const client = new ElevenLabsClient();

for (const [id, text] of Object.entries(lines)) {
  if (only.length && !only.includes(id)) continue;
  const file = path.join(outDir, `${id}.mp3`);
  if (!fs.existsSync(file)) {
    const audio = await client.textToSpeech.convert(VOICE, {
      text,
      modelId: MODEL,
      outputFormat: "mp3_44100_128",
      voiceSettings: { stability: 0.6, similarityBoost: 0.8 },
    });
    const chunks = [];
    for await (const chunk of audio) chunks.push(Buffer.from(chunk));
    fs.writeFileSync(file, Buffer.concat(chunks));
    console.log("generated", id, `${text.length} chars`);
  }
  durations[id] = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim(),
  );
}

fs.writeFileSync(durationsPath, JSON.stringify(durations, null, 1));
console.log("durations", durations);
