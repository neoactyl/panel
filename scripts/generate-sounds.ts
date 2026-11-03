import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'static', 'sounds');
mkdirSync(outDir, { recursive: true });

// Minimal WAV writer: 44.1kHz, mono, 16-bit PCM.
const writeWav = (name: string, samples: Float32Array) => {
	const sampleRate = 44100;
	const bytesPerSample = 2;
	const dataSize = samples.length * bytesPerSample;
	const headerSize = 44;

	const buffer = Buffer.alloc(headerSize + dataSize);
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	// RIFF chunk
	view.setUint32(0, 0x52494646, false); // "RIFF"
	view.setUint32(4, 36 + dataSize, true);
	view.setUint32(8, 0x57415645, false); // "WAVE"

	// fmt subchunk
	view.setUint32(12, 0x666d7420, false); // "fmt "
	view.setUint32(16, 16, true); // subchunk1Size
	view.setUint16(20, 1, true); // audioFormat = PCM
	view.setUint16(22, 1, true); // numChannels = 1
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * bytesPerSample, true); // byteRate
	view.setUint16(32, bytesPerSample, true); // blockAlign
	view.setUint16(34, 16, true); // bitsPerSample

	// data subchunk
	view.setUint32(36, 0x64617461, false); // "data"
	view.setUint32(40, dataSize, true);

	let offset = headerSize;
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(offset, s * 0x7fff, true);
		offset += 2;
	}

	writeFileSync(join(outDir, name), buffer);
};

const tone = (frequency: number, durationMs: number, type: 'sine' | 'square' = 'sine') => {
	const sampleRate = 44100;
	const length = Math.round((sampleRate * durationMs) / 1000);
	const samples = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		const t = i / sampleRate;
		let v = 0;
		if (type === 'sine') {
			v = Math.sin(2 * Math.PI * frequency * t);
		} else {
			v = Math.sin(2 * Math.PI * frequency * t) > 0 ? 1 : -1;
		}
		// Short fade in/out to avoid clicks
		const fade = Math.min(1, i / 50, (length - i) / 50);
		samples[i] = v * 0.15 * fade;
	}
	return samples;
};

// A short ascending "start" sound
writeWav('start.wav', tone(523.25, 250)); // C5

// A short descending "stop" sound
writeWav('stop.wav', tone(392.00, 250)); // G4

// A rising arpeggio for restart
const restart = new Float32Array(
	Math.round((44100 * 450) / 1000)
);
for (let i = 0; i < restart.length; i++) {
	const t = i / 44100;
	const phase = i / restart.length;
	const freq = 440 + phase * 220;
	restart[i] = Math.sin(2 * Math.PI * freq * t) * 0.15 * Math.min(1, phase * 2);
}
writeWav('restart.wav', restart);

// A sharp low tone for kill
writeWav('kill.wav', tone(150, 300, 'square'));

// A bright "success" chord-ish arpeggio
const success = new Float32Array(Math.round((44100 * 500) / 1000));
const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
for (let i = 0; i < success.length; i++) {
	const t = i / 44100;
	const segment = Math.floor((i / success.length) * notes.length);
	const freq = notes[Math.min(segment, notes.length - 1)];
	const env = Math.min(1, i / 100, (success.length - i) / 400);
	success[i] = Math.sin(2 * Math.PI * freq * t) * 0.12 * env;
}
writeWav('success.wav', success);

// A low "error" buzz
writeWav('error.wav', tone(180, 400, 'square'));

console.log('Generated sound files in static/sounds/');
