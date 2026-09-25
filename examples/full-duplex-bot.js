/**
 * Firetell Audio Stream — Example 2: Full-Duplex Custom AI Voice Bot
 *
 * This server implements a full-duplex audio proxy between Firetell and your
 * custom AI voice bot pipeline. The server:
 *
 *  1. Receives raw PCM audio from the caller (via Firetell)
 *  2. Passes it to your STT / LLM / TTS pipeline
 *  3. Sends synthesized PCM audio back to Firetell, which plays it to the caller
 *
 * Audio format (both directions):
 *   - Encoding: 16-bit signed PCM, little-endian
 *   - Sample rate: 8000 Hz (default) or 16000 Hz — must match your stream action config
 *   - Incoming (Firetell → Your server): stereo if track=both, mono if track=inbound/outbound
 *   - Outgoing (Your server → Firetell): mono at the configured sample_rate
 *
 * Control frames (Your server → Firetell):
 *   - Send JSON text frame { "type": "killAudio" } to immediately stop queued
 *     playback on Firetell's side (use for barge-in / interruption detection)
 *
 * Firetell automatically appends the following query params to your ws_url:
 *   ?workspace_id=...&call_id=...&caller_number=...&caller_name=...
 *   &destination_number=...&stream_type=firetell_stream
 *
 * Usage:
 *   PORT=3001 node examples/full-duplex-bot.js
 *
 * Then configure your Firetell call flow or outbound call with:
 *   {
 *     "action": "stream",
 *     "params": {
 *       "ws_url": "wss://your-server.example.com/bot",
 *       "track": "both",
 *       "sample_rate": 8000,
 *       "bidirectional": true,
 *       "headers": { "Authorization": "Bearer YOUR_SECRET_TOKEN" }
 *     }
 *   }
 *
 * IMPORTANT: bidirectional: true requires answer_call: true (the default).
 * Audio injection only works after the call channel is in the ACTIVE (answered) state.
 */

'use strict';

const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3001;
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Optional: set to require token auth
const SAMPLE_RATE = Number(process.env.SAMPLE_RATE) || 8000; // Must match stream action config

const wss = new WebSocketServer({ port: PORT });

console.log(`[bot] WebSocket server listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws, req) => {
  // ── 1. Parse call context from query params ───────────────────────────────
  const url = new URL(req.url, `http://localhost`);
  const callId            = url.searchParams.get('call_id')           || 'unknown';
  const workspaceId       = url.searchParams.get('workspace_id')      || '';
  const callerNumber      = url.searchParams.get('caller_number')     || '';
  const callerName        = url.searchParams.get('caller_name')       || '';
  const destinationNumber = url.searchParams.get('destination_number')|| '';

  console.log(`[bot] New bidirectional call connected:`, {
    callId, workspaceId, callerNumber, callerName, destinationNumber,
  });

  // ── 2. Optional: verify Authorization header ──────────────────────────────
  if (AUTH_TOKEN) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
      console.warn(`[bot] Unauthorized connection from call ${callId} — closing`);
      ws.close(1008, 'Unauthorized');
      return;
    }
  }

  // ── 3. Session state ──────────────────────────────────────────────────────
  let chunksReceived = 0;
  let isActive = true;
  const startedAt = Date.now();

  // ── 4. Helper: send PCM audio back to Firetell (plays to caller) ──────────
  /**
   * Send a Buffer of raw 16-bit signed PCM mono audio to Firetell.
   * Firetell will play this audio to the caller in real-time.
   *
   * @param {Buffer} pcmBuffer - Raw PCM audio, 16-bit little-endian, mono, at SAMPLE_RATE Hz
   */
  function sendAudioToFiretell(pcmBuffer) {
    if (!isActive || ws.readyState !== ws.constructor.OPEN) return;
    ws.send(pcmBuffer, { binary: true }, (err) => {
      if (err) console.error(`[bot] Error sending audio to call ${callId}:`, err.message);
    });
  }

  // ── 5. Helper: stop queued playback (barge-in) ────────────────────────────
  /**
   * Instruct Firetell to immediately stop any audio currently being played
   * to the caller. Call this when the caller starts speaking (barge-in).
   */
  function sendKillAudio() {
    if (!isActive || ws.readyState !== ws.constructor.OPEN) return;
    ws.send(JSON.stringify({ type: 'killAudio' }), (err) => {
      if (err) console.error(`[bot] Error sending killAudio to call ${callId}:`, err.message);
      else console.log(`[bot] Sent killAudio (barge-in) for call ${callId}`);
    });
  }

  // ── 6. Greeting: play welcome audio when connection is established ─────────
  // In a real implementation, generate this via your TTS provider.
  // Here we generate a simple 1-second sine wave tone as a placeholder.
  const greeting = generateSineTone(440, 1.0, SAMPLE_RATE);
  // Small delay to ensure the channel is fully ready before sending audio
  setTimeout(() => sendAudioToFiretell(greeting), 200);

  // ── 7. Handle incoming audio frames (caller's speech) ────────────────────
  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      // Firetell does not send text frames in bidirectional mode
      return;
    }

    const callerAudio = Buffer.isBuffer(data) ? data : Buffer.from(data);
    chunksReceived++;

    // ── Your AI pipeline here ───────────────────────────────────────────────
    //
    // Step 1: Voice Activity Detection (VAD)
    //   Detect if the caller is speaking to trigger barge-in
    //   Example: if (vadDetector.isSpeaking(callerAudio)) sendKillAudio();
    //
    // Step 2: Speech-to-Text (STT)
    //   Stream callerAudio to your STT provider (e.g. Deepgram, Google, OpenAI Whisper)
    //   Example: sttStream.write(callerAudio);
    //
    // Step 3: LLM Processing (on final transcript)
    //   Send transcript to your LLM (e.g. GPT-4, Gemini)
    //   Example: const response = await llm.chat(transcript);
    //
    // Step 4: Text-to-Speech (TTS)
    //   Convert LLM response to PCM audio (must be mono, 16-bit, at SAMPLE_RATE Hz)
    //   Example: const responseAudio = await tts.synthesize(response, { sampleRate: SAMPLE_RATE });
    //            sendAudioToFiretell(responseAudio);
    //
    // ────────────────────────────────────────────────────────────────────────

    // Demo: echo a short beep every 100 chunks (~2 seconds) as proof-of-concept
    if (chunksReceived % 100 === 0) {
      console.log(`[bot] call=${callId} chunks=${chunksReceived} bytes=${callerAudio.byteLength}`);
      const beep = generateSineTone(880, 0.1, SAMPLE_RATE); // 100ms beep
      sendAudioToFiretell(beep);
    }
  });

  // ── 8. Handle close ───────────────────────────────────────────────────────
  ws.on('close', (code, reason) => {
    isActive = false;
    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[bot] Call ended: call=${callId} duration=${durationSec}s ` +
      `chunks=${chunksReceived} code=${code} reason=${reason.toString()}`,
    );
    // Clean up your STT/LLM/TTS pipeline resources here
  });

  // ── 9. Handle errors ──────────────────────────────────────────────────────
  ws.on('error', (err) => {
    isActive = false;
    console.error(`[bot] WebSocket error for call ${callId}:`, err.message);
  });
});

// ── Utility: generate a sine wave tone as raw PCM ────────────────────────────
/**
 * Generate a pure sine tone as a 16-bit signed PCM Buffer.
 * In production, replace this with your actual TTS output.
 *
 * @param {number} frequencyHz - Tone frequency in Hz (e.g. 440 for A4)
 * @param {number} durationSec - Duration in seconds
 * @param {number} sampleRate  - Sample rate in Hz (must match stream config)
 * @returns {Buffer} Raw 16-bit signed PCM, mono, little-endian
 */
function generateSineTone(frequencyHz, durationSec, sampleRate) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const buf = Buffer.allocUnsafe(numSamples * 2); // 2 bytes per 16-bit sample
  const amplitude = 8000; // ~25% volume (max 32767 for 16-bit)

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * frequencyHz * i / sampleRate));
    buf.writeInt16LE(sample, i * 2);
  }
  return buf;
}
