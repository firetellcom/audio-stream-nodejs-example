/**
 * Firetell Audio Stream — Example 1: One-Way Monitoring
 *
 * This server receives a live audio stream from Firetell during an active call.
 * Use this pattern for:
 *  - Real-time speech-to-text (STT) / transcription
 *  - Keyword detection & compliance monitoring
 *  - Call analytics and sentiment analysis
 *  - Audio recording
 *
 * Audio format: raw 16-bit signed PCM, little-endian
 *   - Sample rate: 8000 Hz or 16000 Hz (as configured in the stream action)
 *   - Channels: 1 (mono) if track=inbound/outbound, 2 (stereo) if track=both
 *              Stereo: left channel = caller, right channel = callee
 *
 * Firetell automatically appends the following query parameters to your ws_url:
 *   ?workspace_id=...&call_id=...&caller_number=...&caller_name=...
 *   &destination_number=...&stream_type=firetell_stream
 *
 * Usage:
 *   PORT=3000 node examples/one-way-monitor.js
 *
 * Then configure your Firetell call flow or outbound call with:
 *   {
 *     "action": "stream",
 *     "params": {
 *       "ws_url": "wss://your-server.example.com/stream",
 *       "track": "both",
 *       "bidirectional": false,
 *       "headers": { "Authorization": "Bearer YOUR_SECRET_TOKEN" }
 *     }
 *   }
 */

'use strict';

const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Optional: set to require token auth

const wss = new WebSocketServer({ port: PORT });

console.log(`[monitor] WebSocket server listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws, req) => {
  // ── 1. Parse call context from query params ───────────────────────────────
  const url = new URL(req.url, `http://localhost`);
  const callId           = url.searchParams.get('call_id')           || 'unknown';
  const workspaceId      = url.searchParams.get('workspace_id')      || '';
  const callerNumber     = url.searchParams.get('caller_number')     || '';
  const callerName       = url.searchParams.get('caller_name')       || '';
  const destinationNumber= url.searchParams.get('destination_number')|| '';
  const streamType       = url.searchParams.get('stream_type')       || '';

  console.log(`[monitor] New call stream connected:`, {
    callId, workspaceId, callerNumber, callerName, destinationNumber, streamType,
  });

  // ── 2. Optional: verify Authorization header ──────────────────────────────
  if (AUTH_TOKEN) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
      console.warn(`[monitor] Unauthorized connection from call ${callId} — closing`);
      ws.close(1008, 'Unauthorized');
      return;
    }
  }

  // ── 3. Track stats ────────────────────────────────────────────────────────
  let chunksReceived = 0;
  let bytesReceived = 0;
  const startedAt = Date.now();

  // ── 4. Optional: open a file to save raw PCM audio ───────────────────────
  // Uncomment to write raw PCM to disk. Play back with:
  //   ffplay -f s16le -ar 8000 -ac 2 recordings/<call_id>.pcm
  //
  // const recordingsDir = path.join(__dirname, '..', 'recordings');
  // fs.mkdirSync(recordingsDir, { recursive: true });
  // const outputFile = fs.createWriteStream(path.join(recordingsDir, `${callId}.pcm`));

  // ── 5. Handle incoming audio frames ──────────────────────────────────────
  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      // Firetell does not send text frames in one-way mode
      console.log(`[monitor] Unexpected text frame from call ${callId}:`, data.toString());
      return;
    }

    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    chunksReceived++;
    bytesReceived += chunk.byteLength;

    // Log every 50 chunks (~1 second at 20ms/chunk)
    if (chunksReceived % 50 === 0) {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `[monitor] call=${callId} elapsed=${elapsedSec}s chunks=${chunksReceived} bytes=${bytesReceived}`,
      );
    }

    // ── Your processing logic here ──────────────────────────────────────────
    // Examples:
    //   outputFile.write(chunk);                         // save to disk
    //   sttProvider.sendAudio(chunk);                    // stream to STT API
    //   complianceEngine.analyze(chunk, { callId });     // compliance check
    // ───────────────────────────────────────────────────────────────────────
  });

  // ── 6. Handle close ───────────────────────────────────────────────────────
  ws.on('close', (code, reason) => {
    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[monitor] Call stream ended: call=${callId} duration=${durationSec}s ` +
      `chunks=${chunksReceived} bytes=${bytesReceived} code=${code} reason=${reason.toString()}`,
    );
    // outputFile.end();
  });

  // ── 7. Handle errors ──────────────────────────────────────────────────────
  ws.on('error', (err) => {
    console.error(`[monitor] WebSocket error for call ${callId}:`, err.message);
  });
});
