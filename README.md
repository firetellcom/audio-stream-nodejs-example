# Firetell Audio Stream — Node.js Examples

> **Official sample code** for the Firetell `stream` call action.  
> Connect live call audio to your own WebSocket server for real-time transcription, compliance monitoring, or a fully custom AI voice bot.

📚 **Documentation**: [developers.firetell.com/docs/rest-api/workspace-api/call](https://developers.firetell.com/docs/rest-api/workspace-api/call/#8-custom-voice-bot-via-audio-stream)

---

## Overview

When you use the `stream` action in a Firetell call flow or outbound call, Firetell establishes a WebSocket connection to your server and streams raw **16-bit signed PCM audio** in real-time. With `bidirectional: true`, your server can also send audio back to be played to the caller.

```
[Caller] ◄──► [Firetell] ◄──► Your WebSocket Server
                                       │
                         One-way:  STT / Analytics / Recording
                         Full-duplex:  STT → LLM → TTS (AI Voice Bot)
```

---

## Examples

### Example 1 — One-Way Monitoring (`one-way-monitor.js`)

Receive the caller's live audio stream **without** affecting the call. Suitable for:

- Real-time speech-to-text (STT) transcription
- Keyword detection & compliance monitoring
- Call analytics and sentiment analysis
- Audio recording / archiving

### Example 2 — Full-Duplex AI Voice Bot (`full-duplex-bot.js`)

Receive audio **and** send audio back — build a fully custom AI voice bot using any STT, LLM, and TTS provider of your choice. Suitable for:

- Custom voice assistants with any AI model (GPT-4, Gemini, Claude, etc.)
- Virtual agents with proprietary business logic
- Real-time translation and interpretation services

---

## Prerequisites

- Node.js **18+**
- A Firetell workspace with API access — [firetell.com](https://firetell.com)
- A publicly accessible HTTPS/WSS endpoint (use [ngrok](https://ngrok.com) for local testing)

---

## Setup

```bash
git clone https://github.com/firetellcom/audio-stream-nodejs-example.git
cd audio-stream-nodejs-example
npm install
```

---

## Run the Examples

### One-Way Monitoring

```bash
PORT=3000 AUTH_TOKEN=your-secret-token node examples/one-way-monitor.js
```

### Full-Duplex AI Voice Bot

```bash
PORT=3001 AUTH_TOKEN=your-secret-token SAMPLE_RATE=8000 node examples/full-duplex-bot.js
```

| Environment Variable | Default         | Description                                                           |
| -------------------- | --------------- | --------------------------------------------------------------------- |
| `PORT`               | `3000` / `3001` | WebSocket server port                                                 |
| `AUTH_TOKEN`         | _(empty)_       | If set, validates `Authorization: Bearer <token>` header              |
| `SAMPLE_RATE`        | `8000`          | PCM sample rate — must match your `stream` action `sample_rate` param |

---

## Configure Your Firetell Call Flow

In your [JCA webhook response](https://developers.firetell.com/docs/rest-api/workspace-api/call-flows) or outbound [Make Call API](https://developers.firetell.com/docs/rest-api/workspace-api/call) request, include the `stream` action:

### One-Way Monitoring

```json
{
  "actions": [
    {
      "action": "stream",
      "params": {
        "ws_url": "wss://your-server.example.com/stream",
        "track": "both",
        "bidirectional": false,
        "headers": {
          "Authorization": "Bearer your-secret-token"
        }
      }
    }
  ]
}
```

### Full-Duplex AI Voice Bot

```json
{
  "actions": [
    {
      "action": "stream",
      "params": {
        "ws_url": "wss://your-server.example.com/bot",
        "track": "both",
        "sample_rate": 8000,
        "bidirectional": true,
        "headers": {
          "Authorization": "Bearer your-secret-token"
        }
      }
    }
  ]
}
```

---

## Audio Format

| Property                                        | Value                                  |
| ----------------------------------------------- | -------------------------------------- |
| Encoding                                        | 16-bit signed PCM, little-endian       |
| Sample rate                                     | `8000` Hz (default) or `16000` Hz      |
| Channels (incoming, `track=both`)               | Stereo — left = caller, right = callee |
| Channels (incoming, `track=inbound`/`outbound`) | Mono                                   |
| Channels (outgoing to Firetell)                 | Mono                                   |

---

## WebSocket Protocol

| Direction              | Frame type  | Content                                                     |
| ---------------------- | ----------- | ----------------------------------------------------------- |
| Firetell → Your server | Binary      | Raw PCM audio (caller's speech)                             |
| Your server → Firetell | Binary      | Raw PCM audio (bot speech — requires `bidirectional: true`) |
| Your server → Firetell | Text (JSON) | `{"type":"killAudio"}` — stop queued playback (barge-in)    |

---

## Query Parameters (Auto-Appended by Firetell)

Firetell automatically appends the following to your `ws_url` so you can identify the call without custom headers:

| Parameter            | Description                          |
| -------------------- | ------------------------------------ |
| `call_id`            | Unique Firetell call identifier      |
| `workspace_id`       | Your Firetell workspace ID           |
| `caller_number`      | Caller's phone number (E.164)        |
| `caller_name`        | Caller's display name (if available) |
| `destination_number` | The dialed number                    |
| `stream_type`        | Always `firetell_stream`             |

---

## Local Development with ngrok

If you don't have a public server, use [ngrok](https://ngrok.com) to expose your local server:

```bash
# Terminal 1 — start your server
node examples/full-duplex-bot.js

# Terminal 2 — expose it publicly
ngrok http 3001
```

Use the `wss://` ngrok URL in your `ws_url` param.

---

## Build Your AI Pipeline

Replace the placeholder logic in `full-duplex-bot.js` with your actual pipeline:

```js
ws.on("message", async (data, isBinary) => {
  if (!isBinary) return;
  const callerAudio = Buffer.from(data);

  // 1. Voice Activity Detection (barge-in)
  if (vad.isSpeaking(callerAudio)) sendKillAudio();

  // 2. Stream to STT (e.g. Deepgram, Google, OpenAI Whisper)
  sttStream.write(callerAudio);
});

sttStream.on("transcript", async (text) => {
  // 3. LLM (e.g. OpenAI GPT-4, Google Gemini)
  const reply = await llm.chat(text);

  // 4. TTS → PCM (must be mono, 16-bit, at SAMPLE_RATE Hz)
  const audioPcm = await tts.synthesize(reply, { sampleRate: SAMPLE_RATE });
  sendAudioToFiretell(audioPcm);
});
```

---

## License

MIT — see [LICENSE](LICENSE)

## Contributing

Issues and PRs are welcome at [github.com/firetellcom/audio-stream-nodejs-example](https://github.com/firetellcom/audio-stream-nodejs-example).
