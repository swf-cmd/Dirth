/*
 * City soundtracks for the Kyoto, Okinawa and Hokkaido themes: three original,
 * locally synthesized instrumentals, 96-second loops like Tokyo Afterimage.
 * No recordings, samples or network requests: plucked strings are modeled with
 * Karplus-Strong, bells and music-box tines are additive sine partials, and
 * breath, waves and wind are filtered noise from a fixed seed. Each render
 * includes preceding bars so reverb and sustained notes cross the loop seam.
 *
 *   Kyoto Lanterns · 京都灯籠         60 BPM, 4/4, 24 bars, D miyako-bushi
 *   Okinawa Island Time · 沖縄島時間  90 BPM, 4/4 swing, 36 bars, C Ryukyu scale
 *   Hokkaido Snowlight · 北海道雪あかり 75 BPM, 3/4, 40 bars, D major waltz
 */
(() => {
  'use strict';

  const SAMPLE_RATE = 44100;
  const midiHz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const random = seed => {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  };

  // ------------------------------------------------------------------ studio
  function createStudio(offline, options) {
    const gain = (value, destination) => {
      const node = offline.createGain();
      node.gain.value = value;
      if (destination) node.connect(destination);
      return node;
    };
    const filter = (type, frequency, destination, q = 0.6, boost = 0) => {
      const node = offline.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      node.gain.value = boost;
      if (destination) node.connect(destination);
      return node;
    };
    const pan = (value, destination) => {
      const node = offline.createStereoPanner();
      node.pan.value = Math.max(-1, Math.min(1, value));
      node.connect(destination);
      return node;
    };
    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = options.threshold ?? -20;
    compressor.knee.value = 14;
    compressor.ratio.value = 2.4;
    compressor.attack.value = options.attack ?? 0.02;
    compressor.release.value = 0.3;
    compressor.connect(offline.destination);
    const mix = filter('lowpass', options.ceiling ?? 9000, compressor);

    // Seeded room: smoothed noise with an exponential tail.
    const impulse = offline.createBuffer(2, Math.floor(SAMPLE_RATE * options.reverbSeconds), SAMPLE_RATE);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      const rng = random(options.seed + channel * 131);
      let smooth = 0;
      for (let index = 0; index < samples.length; index++) {
        smooth = smooth * options.reverbSmooth + (rng() * 2 - 1) * (1 - options.reverbSmooth);
        const seconds = index / SAMPLE_RATE;
        samples[index] = smooth * Math.exp(-seconds * options.reverbDecay) * Math.min(1, seconds / 0.02);
      }
    }
    const reverb = offline.createConvolver();
    reverb.buffer = impulse;
    reverb.connect(filter('lowpass', options.reverbTone, gain(options.reverbLevel, mix)));

    const echo = gain(1);
    const left = offline.createDelay(2), right = offline.createDelay(2);
    left.delayTime.value = options.echoLeft;
    right.delayTime.value = options.echoRight;
    echo.connect(left);
    left.connect(pan(-0.6, gain(0.22, mix)));
    right.connect(pan(0.6, gain(0.18, mix)));
    left.connect(filter('lowpass', 2600, gain(0.3, right)));
    right.connect(filter('lowpass', 2200, gain(0.3, left)));
    left.connect(gain(0.08, reverb));

    const noise = offline.createBuffer(1, SAMPLE_RATE * 2, SAMPLE_RATE);
    const noiseSamples = noise.getChannelData(0);
    const noiseRng = random(options.seed ^ 0x5eed);
    for (let index = 0; index < noiseSamples.length; index++) noiseSamples[index] = noiseRng() * 2 - 1;

    // A bus sends part of its signal to the room and the echo.
    const bus = ({ level = 1, room = 0.2, delay = 0, lowpass = 12000, highpass = 0, compress = null }) => {
      const input = gain(1);
      let node = input;
      if (compress) {
        // Plucked strings have sharp attacks; even them out before the room.
        const squeeze = offline.createDynamicsCompressor();
        squeeze.threshold.value = compress.threshold;
        squeeze.knee.value = 6;
        squeeze.ratio.value = compress.ratio;
        squeeze.attack.value = 0.002;
        squeeze.release.value = 0.12;
        node.connect(squeeze);
        node = squeeze;
      }
      if (highpass) node = (() => { const hp = filter('highpass', highpass); node.connect(hp); return hp; })();
      const lp = filter('lowpass', lowpass);
      node.connect(lp);
      lp.connect(gain(level, mix));
      if (room) lp.connect(gain(room, reverb));
      if (delay) lp.connect(gain(delay, echo));
      return input;
    };

    function oscillator(type, frequency, time, end, destination, detune = 0) {
      const node = offline.createOscillator();
      node.type = type;
      node.frequency.setValueAtTime(frequency, time);
      node.detune.setValueAtTime(detune, time);
      node.connect(destination);
      node.start(time);
      node.stop(end);
      return node;
    }
    // Slow pitch drift (vibrato or tape wobble) as automation points, so
    // finished voices leave the graph instead of holding a shared LFO.
    function wobble(param, time, end, depth, rate, base = 0, phase = 0, delay = 0) {
      param.setValueAtTime(base, time);
      for (let point = time + 0.05; point < end; point += 0.05) {
        const fade = delay ? Math.min(1, (point - time) / delay) : 1;
        param.linearRampToValueAtTime(base + Math.sin((point - time) * Math.PI * 2 * rate + phase) * depth * fade, point);
      }
    }
    function envelope(destination, time, peak, attack, hold, release, curve = 'exp') {
      const node = gain(0, destination);
      node.gain.setValueAtTime(0, time);
      node.gain.linearRampToValueAtTime(peak, time + attack);
      if (curve === 'exp') {
        node.gain.setValueAtTime(peak, time + attack + hold);
        node.gain.exponentialRampToValueAtTime(0.00001, time + attack + hold + release);
      } else {
        node.gain.setValueAtTime(peak, time + attack + hold);
        node.gain.linearRampToValueAtTime(0, time + attack + hold + release);
      }
      return node;
    }
    function noiseBurst(time, duration, destination, offset = 0) {
      const source = offline.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      source.connect(destination);
      source.start(time, (offset + time * 0.173) % 1.9);
      source.stop(time + duration);
      return source;
    }

    // Karplus-Strong strings, cached per pitch. The delay line has a whole
    // number of samples; playbackRate restores exact tuning.
    const strings = new Map();
    function stringBuffer(midi, preset) {
      const key = `${preset.name}:${midi}`;
      if (strings.has(key)) return strings.get(key);
      const frequency = midiHz(midi);
      const period = Math.max(4, Math.round(SAMPLE_RATE / frequency));
      const length = Math.round(preset.seconds * SAMPLE_RATE);
      const out = new Float32Array(length);
      const rng = random(preset.seed + midi * 977);
      const ring = new Float32Array(period);
      let low = 0;
      for (let index = 0; index < period; index++) {
        low += preset.brightness * ((rng() * 2 - 1) - low);
        ring[index] = low;
      }
      // Pluck position: a comb notch shapes the attack's harmonics.
      const pick = Math.max(1, Math.round(period * preset.position));
      const shaped = ring.map((value, index) => value - ring[(index + pick) % period] * 0.9);
      const mean = shaped.reduce((sum, value) => sum + value, 0) / period;
      for (let index = 0; index < period; index++) ring[index] = shaped[index] - mean;
      const decay = Math.pow(preset.decay, 440 / frequency * preset.lowSustain + (1 - preset.lowSustain));
      let index = 0, peak = 0;
      for (let n = 0; n < length; n++) {
        const current = ring[index], next = ring[(index + 1) % period];
        out[n] = current;
        ring[index] = decay * ((1 - preset.damping) * current + preset.damping * next);
        index = (index + 1) % period;
        peak = Math.max(peak, Math.abs(current));
      }
      const fadeOut = Math.round(0.04 * SAMPLE_RATE);
      for (let n = 0; n < length; n++) out[n] = out[n] / (peak || 1) * Math.min(1, (length - n) / fadeOut);
      const buffer = offline.createBuffer(1, length, SAMPLE_RATE);
      buffer.copyToChannel(out, 0);
      // Averaging with the next, older sample shortens the loop by `damping`
      // samples, so the string rings at SAMPLE_RATE / (period - damping).
      const entry = { buffer, rate: frequency / (SAMPLE_RATE / (period - preset.damping)) };
      strings.set(key, entry);
      return entry;
    }
    function pluck(preset, midi, time, velocity, destination, { bend = 0, bendAt = 0.12, bendTime = 0.18, length } = {}) {
      const { buffer, rate } = stringBuffer(midi, preset);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(rate, time);
      if (bend) {
        // Pressing the string behind the bridge (oshide) lifts the pitch.
        source.playbackRate.setValueAtTime(rate, time + bendAt);
        source.playbackRate.linearRampToValueAtTime(rate * Math.pow(2, bend / 1200), time + bendAt + bendTime);
      }
      const level = gain(velocity, destination);
      source.connect(level);
      const seconds = Math.min(buffer.duration / rate, length ?? Infinity);
      if (length !== undefined) {
        level.gain.setValueAtTime(velocity, time + Math.max(0.01, seconds - 0.08));
        level.gain.linearRampToValueAtTime(0, time + seconds);
      }
      source.start(time);
      source.stop(time + seconds + 0.01);
    }
    return { offline, gain, filter, pan, mix, reverb, echo, bus, oscillator, wobble, envelope, noiseBurst, pluck };
  }

  async function renderScore(score) {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) throw new Error('此设备不支持背景音乐合成');
    const beat = 60 / score.bpm;
    const bar = beat * score.beatsPerBar;
    const duration = bar * score.bars;
    const preroll = bar * score.prerollBars;
    const offline = new OfflineContext(2, Math.round((duration + preroll) * SAMPLE_RATE), SAMPLE_RATE);
    const studio = createStudio(offline, score.studio);
    score.compose(studio, { beat, bar, duration, preroll });
    const rendered = await offline.startRendering();
    const length = Math.round(duration * SAMPLE_RATE);
    const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: SAMPLE_RATE });
    const startFrame = Math.round(preroll * SAMPLE_RATE);
    let peak = 0, squareSum = 0;
    for (let channel = 0; channel < 2; channel++) {
      const samples = rendered.getChannelData(channel).subarray(startFrame, startFrame + length);
      buffer.copyToChannel(samples, channel);
      for (let index = 0; index < samples.length; index++) {
        peak = Math.max(peak, Math.abs(samples[index]));
        squareSum += samples[index] * samples[index];
      }
    }
    const rms = Math.sqrt(squareSum / (length * 2));
    if (!Number.isFinite(peak) || peak < 0.0001 || !Number.isFinite(rms)) throw new Error('背景音乐合成结果无效');
    // Match Tokyo Afterimage's perceived loudness (about -17 LUFS) rather than
    // its RMS, which is mostly bass, and keep every track below the player's
    // 0.64 headroom budget.
    const normalization = Math.min(0.62 / peak, Math.pow(10, (score.loudness - loudness(buffer)) / 20));
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let index = 0; index < samples.length; index++) samples[index] *= normalization;
    }
    return { buffer, peak: peak * normalization, rms: rms * normalization };
  }

  // Integrated loudness after ITU-R BS.1770 K-weighting (ungated: each loop
  // is steady), so tracks with different bass weight sound equally loud.
  function loudness(buffer) {
    const biquad = (b0, b1, b2, a0, a1, a2) => [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
    const rate = buffer.sampleRate;
    const shelf = (() => {
      const gainDb = 3.999843853973347, q = 0.7071752369554196, frequency = 1681.974450955533;
      const a = Math.pow(10, gainDb / 40), w = 2 * Math.PI * frequency / rate, alpha = Math.sin(w) / (2 * q), cos = Math.cos(w), root = Math.sqrt(a);
      return biquad(a * ((a + 1) + (a - 1) * cos + 2 * root * alpha), -2 * a * ((a - 1) + (a + 1) * cos), a * ((a + 1) + (a - 1) * cos - 2 * root * alpha),
        (a + 1) - (a - 1) * cos + 2 * root * alpha, 2 * ((a - 1) - (a + 1) * cos), (a + 1) - (a - 1) * cos - 2 * root * alpha);
    })();
    const highpass = (() => {
      const q = 0.5003270373238773, frequency = 38.13547087602444;
      const w = 2 * Math.PI * frequency / rate, alpha = Math.sin(w) / (2 * q), cos = Math.cos(w);
      return biquad((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
    })();
    let total = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      let samples = buffer.getChannelData(channel);
      for (const [b0, b1, b2, a1, a2] of [shelf, highpass]) {
        const out = new Float32Array(samples.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let index = 0; index < samples.length; index++) {
          const x = samples[index];
          const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
          x2 = x1; x1 = x; y2 = y1; y1 = y;
          out[index] = y;
        }
        samples = out;
      }
      let sum = 0;
      for (let index = 0; index < samples.length; index++) sum += samples[index] * samples[index];
      total += sum / samples.length;
    }
    return -0.691 + 10 * Math.log10(total);
  }

  // Iterate over every bar, including the preroll that wraps from the end.
  function eachBar(bars, prerollBars, barSeconds, callback) {
    for (let index = -prerollBars; index < bars; index++) {
      const number = (index + bars) % bars;
      callback(number, (index + prerollBars) * barSeconds);
    }
  }

  // ------------------------------------------------------------------- Kyoto
  const kyoto = {
    bpm: 60, beatsPerBar: 4, bars: 24, prerollBars: 8, loudness: -17.5,
    studio: { seed: 7301, reverbSeconds: 5, reverbDecay: 1.15, reverbSmooth: 0.66, reverbTone: 3400, reverbLevel: 0.34, echoLeft: 0.75, echoRight: 1.0, ceiling: 8500, threshold: -22 },
    compose(s, { beat, bar }) {
      const koto = { name: 'koto', seconds: 4.2, brightness: 0.62, position: 0.13, decay: 0.9991, damping: 0.42, lowSustain: 0.55, seed: 501 };
      const bassKoto = { name: 'jushichigen', seconds: 5, brightness: 0.35, position: 0.2, decay: 0.9994, damping: 0.48, lowSustain: 0.4, seed: 777 };
      // Koto body: warm wood resonance and a little bite.
      const kotoBus = s.bus({ level: 0.9, room: 0.28, delay: 0.14, lowpass: 5200 });
      const kotoBody = s.filter('peaking', 280, kotoBus, 1.1, 3.5);
      const kotoBite = s.filter('peaking', 2400, kotoBody, 1.4, 2);
      const fluteBus = s.bus({ level: 0.7, room: 0.42, delay: 0.2, lowpass: 3800 });
      const bellBus = s.bus({ level: 0.55, room: 0.6, lowpass: 2600 });
      const shoBus = s.bus({ level: 0.5, room: 0.45, lowpass: 1500 });
      const lowBus = s.bus({ level: 0.75, room: 0.18, lowpass: 900 });
      const woodBus = s.bus({ level: 0.6, room: 0.3, lowpass: 6000, highpass: 180 });

      const shakuhachi = (midi, time, length, velocity = 1, slide = -70) => {
        const freq = midiHz(midi);
        const end = time + length + 0.7;
        const voice = s.pan(0.18, fluteBus);
        // Muraiki: a gust of breath that blooms into the tone, then fades.
        const body = s.gain(0, voice);
        body.gain.setValueAtTime(0, time);
        body.gain.linearRampToValueAtTime(0.034 * velocity, time + 0.12);
        body.gain.linearRampToValueAtTime(0.05 * velocity, time + 0.4);
        body.gain.setValueAtTime(0.05 * velocity, time + Math.max(0.45, length - 0.25));
        body.gain.linearRampToValueAtTime(0, end - 0.05);
        const tone = s.oscillator('sine', freq, time, end, body);
        const reed = s.oscillator('triangle', freq, time, end, s.gain(0.22, body));
        const octave = s.oscillator('sine', freq * 2, time, end, s.gain(0.06, body));
        for (const node of [tone, reed, octave]) {
          // Meri-kari: start slightly flat and lift into the note, then breathe.
          node.detune.setValueAtTime(slide, time);
          node.detune.linearRampToValueAtTime(0, time + 0.28);
          s.wobble(node.detune, time + 0.3, end, 9, 4.6, 0, 0, 0.8);
        }
        const breath = s.envelope(s.pan(0.18, fluteBus), time, 0.06 * velocity, 0.08, length * 0.6, 0.5, 'linear');
        const band = s.filter('bandpass', freq * 2.1, breath, 2.4);
        s.noiseBurst(time, length + 0.7, band, midi * 0.07);
        const chiff = s.envelope(s.pan(0.1, fluteBus), time, 0.05 * velocity, 0.015, 0.02, 0.16);
        s.noiseBurst(time, 0.25, s.filter('highpass', 2600, chiff, 0.7), 0.4);
      };
      const bell = (time, velocity = 1) => {
        // Bonshō: a low hum, inharmonic partials and slow beating between twins.
        const fundamental = 98;
        const partials = [[0.5, 0.5, 13], [1, 1, 10], [1.006, 0.6, 10], [1.19, 0.34, 7], [1.5, 0.22, 6], [2.0, 0.2, 5], [2.42, 0.13, 4], [3.04, 0.08, 3], [4.2, 0.05, 2]];
        for (const [ratio, amplitude, decay] of partials) {
          const tone = s.envelope(s.pan((ratio - 1.5) * 0.15, bellBus), time, 0.06 * amplitude * velocity, 0.004, 0, decay);
          s.oscillator('sine', fundamental * ratio, time, time + decay + 0.1, tone);
        }
        const strike = s.envelope(bellBus, time, 0.05 * velocity, 0.002, 0.01, 0.35);
        s.noiseBurst(time, 0.4, s.filter('lowpass', 700, strike, 0.8), 1.1);
      };
      const sho = (notes, time, length) => {
        // Shō clusters: reedy chords that swell in and out like breath.
        notes.forEach((midi, index) => {
          const voice = s.pan((index / (notes.length - 1) - 0.5) * 0.9, shoBus);
          const env = s.gain(0, voice);
          env.gain.setValueAtTime(0, time);
          env.gain.linearRampToValueAtTime(0.0085, time + length * 0.42);
          env.gain.linearRampToValueAtTime(0.006, time + length * 0.8);
          env.gain.linearRampToValueAtTime(0, time + length + 1.2);
          const square = s.oscillator('square', midiHz(midi), time, time + length + 1.3, s.gain(0.35, env), -4 + index * 2.5);
          const tri = s.oscillator('triangle', midiHz(midi), time, time + length + 1.3, env, 3 - index);
          s.wobble(square.detune, time, time + length + 1.3, 3, 0.21 + index * 0.03, -4 + index * 2.5);
          s.wobble(tri.detune, time, time + length + 1.3, 3, 0.17 + index * 0.02, 3 - index, 1.2);
        });
      };
      const drone = (midi, time, length) => {
        const env = s.envelope(lowBus, time, 0.05, 1.4, Math.max(0, length - 1.6), 1.6, 'linear');
        s.oscillator('sine', midiHz(midi), time, time + length + 0.2, env);
        s.oscillator('triangle', midiHz(midi), time, time + length + 0.2, s.gain(0.2, env), 4);
      };
      const knock = (time, pitch, velocity, position = 0) => {
        // Bamboo and wood: hyoshigi clacks and the shishi-odoshi's hollow knock.
        const env = s.envelope(s.pan(position, woodBus), time, 0.11 * velocity, 0.001, 0.004, 0.09);
        s.oscillator('sine', pitch, time, time + 0.12, env);
        const click = s.envelope(s.pan(position, woodBus), time, 0.05 * velocity, 0.001, 0.002, 0.03);
        s.noiseBurst(time, 0.05, s.filter('bandpass', pitch * 3.1, click, 3), pitch * 0.001);
      };
      const taiko = (time, velocity) => {
        const env = s.envelope(lowBus, time, 0.2 * velocity, 0.003, 0.02, 0.6);
        const tone = s.oscillator('sine', 92, time, time + 0.7, env);
        tone.frequency.exponentialRampToValueAtTime(52, time + 0.25);
        const skin = s.envelope(lowBus, time, 0.03 * velocity, 0.002, 0.01, 0.12);
        s.noiseBurst(time, 0.2, s.filter('lowpass', 500, skin), 0.7);
      };

      // D miyako-bushi: D Eb G A Bb.
      const sections = [
        { shoNotes: [50, 57, 62, 69, 75], low: 38, koto: [[62, 69, 74, null, 75, 74, 69, null], [62, 69, 74, 69, null, 70, 69, 63]] },
        { shoNotes: [55, 62, 67, 70, 74], low: 43, koto: [[55, 62, 67, 62, 70, 69, 67, null], [55, 62, 67, null, 69, 70, 74, null]] },
        { shoNotes: [58, 63, 67, 70, 75], low: 46, koto: [[58, 63, 70, 67, 63, 62, 63, null], [58, 62, 67, 70, 69, 67, 63, 62]] },
        { shoNotes: [57, 62, 63, 69, 74], low: 45, koto: [[57, 62, 69, 70, 69, 63, 62, null], [57, 63, 69, null, 70, 69, 63, 62]] },
      ];
      const plan = [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 2, 3, 1, 1, 2, 2, 0, 0, 1, 1, 2, 3, 0, 0];
      // Shakuhachi phrases: [bar, [[beat, midi, beats], ...]] in miyako-bushi.
      const melody = new Map([
        [4, [[0.5, 69, 2], [2.5, 70, 0.75], [3.25, 69, 0.75]]],
        [5, [[0, 67, 2.5], [3, 69, 0.9]]],
        [6, [[0, 74, 1.75], [2, 75, 0.9], [3, 74, 1]]],
        [7, [[0, 69, 2.25], [2.5, 70, 0.5], [3, 69, 1]]],
        [8, [[0, 67, 1.5], [1.5, 69, 0.5], [2, 70, 2]]],
        [9, [[0, 69, 3.5]]],
        [12, [[0.5, 74, 1.5], [2, 75, 0.75], [2.75, 74, 0.75], [3.5, 70, 0.5]]],
        [13, [[0, 69, 2], [2, 67, 1.5]]],
        [14, [[0, 70, 1], [1, 69, 1], [2, 67, 1], [3, 63, 1]]],
        [15, [[0, 62, 3.5]]],
        [17, [[0.5, 69, 1.5], [2, 74, 2]]],
        [18, [[0, 75, 1], [1, 74, 1], [2, 70, 1], [3, 69, 1]]],
        [19, [[0, 67, 2], [2, 69, 2]]],
        [20, [[0, 70, 1.5], [1.5, 69, 0.5], [2, 67, 1], [3, 63, 1]]],
        [21, [[0, 62, 3.5]]],
      ]);

      eachBar(this.bars, this.prerollBars, bar, (number, start) => {
        const section = sections[plan[number]];
        const rng = random(9100 + number * 7919);
        const intro = number < 2;
        const outro = number >= 22;
        if (number % 4 === 0) sho(section.shoNotes, start, bar * 4);
        if (number % 2 === 0) drone(section.low, start, bar * 2);
        if (number % 8 === 0) bell(start + 0.02, number === 0 ? 1 : 0.8);
        // Bass koto on the downbeat.
        s.pluck(bassKoto, section.low + 12, start + 0.01, intro ? 0.18 : 0.26, s.pan(-0.2, lowBus));
        if (!intro) {
          const pattern = section.koto[number % 2];
          const density = outro ? 0.45 : number < 4 ? 0.7 : 1;
          pattern.forEach((midi, step) => {
            if (midi === null || rng() > density) return;
            const time = start + step * beat * 0.5 + rng() * 0.012;
            const accent = step === 0 ? 1 : step % 2 ? 0.62 : 0.78;
            const bend = step === 4 && number % 4 === 1 ? 100 : 0;
            s.pluck(koto, midi, time, 0.34 * accent * (0.9 + rng() * 0.2), s.pan(0.25 - (midi - 62) * 0.02, kotoBite), bend ? { bend, bendAt: 0.2, bendTime: 0.22 } : {});
          });
        } else {
          s.pluck(koto, 74, start + beat * 1.5, 0.22, s.pan(0.3, kotoBite));
          s.pluck(koto, 69, start + beat * 2.5, 0.18, s.pan(0.2, kotoBite), { bend: 100, bendAt: 0.25, bendTime: 0.25 });
        }
        for (const [position, midi, beats] of melody.get(number) || []) {
          shakuhachi(midi, start + position * beat + 0.02, beats * beat, number >= 12 && number < 16 ? 1.1 : 0.95);
        }
        if (number >= 12 && number < 16) {
          taiko(start + 0.01, 0.55);
          taiko(start + beat * 2 + 0.01, 0.38);
          if (number === 15) { taiko(start + beat * 3, 0.32); taiko(start + beat * 3.5, 0.42); }
        }
        if (number % 8 === 6) knock(start + beat * 2.98, 360, 0.75, 0.45);
        if (number === 11 || number === 23) { knock(start + beat * 3, 1250, 0.55, -0.35); knock(start + beat * 3.5, 1250, 0.7, -0.35); }
      });
    },
  };

  // ----------------------------------------------------------------- Okinawa
  const okinawa = {
    bpm: 90, beatsPerBar: 4, bars: 36, prerollBars: 6, loudness: -17,
    studio: { seed: 2601, reverbSeconds: 2.2, reverbDecay: 2.6, reverbSmooth: 0.5, reverbTone: 5200, reverbLevel: 0.24, echoLeft: 60 / 90 * 0.75, echoRight: 60 / 90 * 0.5, ceiling: 10000, threshold: -22, attack: 0.004 },
    compose(s, { beat, bar }) {
      const swing = beat * 0.09;
      const at = (start, position) => start + position * beat + (Math.abs(position % 1 - 0.5) < 0.01 ? swing : 0);
      const sanshin = { name: 'sanshin', seconds: 1.8, brightness: 0.74, position: 0.09, decay: 0.9965, damping: 0.34, lowSustain: 0.3, seed: 311 };
      const sanshinBus = s.bus({ level: 1.6, room: 0.2, delay: 0.16, lowpass: 6200, highpass: 120, compress: { threshold: -30, ratio: 5 } });
      const skin = s.filter('peaking', 900, sanshinBus, 1.3, 4);
      const twang = s.filter('peaking', 3000, skin, 2, 1.5);
      const keysBus = s.bus({ level: 0.6, room: 0.22, delay: 0.06, lowpass: 4200 });
      const padBus = s.bus({ level: 0.42, room: 0.35, lowpass: 1600 });
      const bassBus = s.bus({ level: 0.9, room: 0.04, lowpass: 600 });
      const drumBus = s.bus({ level: 0.7, room: 0.08 });
      const waveBus = s.bus({ level: 0.5, room: 0.15, lowpass: 2600 });
      const whistleBus = s.bus({ level: 0.4, room: 0.45, delay: 0.25, lowpass: 7000 });
      const leadBus = s.bus({ level: 0.55, room: 0.3, delay: 0.22, lowpass: 5200 });

      const keys = (notes, time, velocity) => {
        // Soft offbeat chords: a rounded electric-piano chank.
        notes.forEach((midi, index) => {
          const env = s.envelope(s.pan((index - 1) * 0.18, keysBus), time + index * 0.006, 0.032 * velocity, 0.006, 0.05, 0.32);
          s.oscillator('sine', midiHz(midi), time, time + 0.5, env, -2);
          s.oscillator('triangle', midiHz(midi) * 2, time, time + 0.3, s.gain(0.12, env), 3);
        });
      };
      const marimba = (midi, time, velocity) => {
        const env = s.envelope(s.pan(-0.22, leadBus), time, 0.14 * velocity, 0.002, 0.01, 0.65);
        s.oscillator('sine', midiHz(midi), time, time + 0.8, env);
        const over = s.envelope(s.pan(-0.22, leadBus), time, 0.04 * velocity, 0.001, 0, 0.09);
        s.oscillator('sine', midiHz(midi) * 3.93, time, time + 0.12, over);
      };
      const pad = (notes, time, length) => {
        notes.forEach((midi, index) => {
          const env = s.envelope(s.pan((index - 1.5) * 0.4, padBus), time, 0.009, 0.9, Math.max(0, length - 1.6), 1.2, 'linear');
          s.oscillator('sawtooth', midiHz(midi), time, time + length + 0.4, env, -6 + index * 4);
          s.oscillator('sawtooth', midiHz(midi), time, time + length + 0.4, env, 7 - index * 3);
        });
      };
      const bass = (midi, time, length, velocity = 1) => {
        const env = s.envelope(bassBus, time, 0.075 * velocity, 0.012, length * 0.5, length * 0.6 + 0.08);
        s.oscillator('triangle', midiHz(midi), time, time + length * 1.2 + 0.2, env);
        s.oscillator('sine', midiHz(midi), time, time + length * 1.2 + 0.2, s.gain(0.7, env));
      };
      const kick = (time, velocity) => {
        const env = s.envelope(drumBus, time, 0.12 * velocity, 0.003, 0.01, 0.22);
        const tone = s.oscillator('sine', 110, time, time + 0.26, env);
        tone.frequency.exponentialRampToValueAtTime(48, time + 0.09);
      };
      const rim = (time, velocity) => {
        const env = s.envelope(s.pan(-0.1, drumBus), time, 0.05 * velocity, 0.001, 0.003, 0.06);
        s.oscillator('triangle', 820, time, time + 0.08, env);
        const snap = s.envelope(s.pan(-0.1, drumBus), time, 0.03 * velocity, 0.001, 0.004, 0.08);
        s.noiseBurst(time, 0.1, s.filter('bandpass', 2200, snap, 1.2), 0.3);
      };
      const shaker = (time, velocity) => {
        const env = s.envelope(s.pan(0.32, drumBus), time, 0.014 * velocity, 0.012, 0.01, 0.06);
        s.noiseBurst(time, 0.1, s.filter('highpass', 6200, env), 0.9);
      };
      const sanba = (time, velocity) => {
        // Sanba: three hardwood clappers rattled in a quick triplet.
        for (let click = 0; click < 3; click++) {
          const env = s.envelope(s.pan(0.42, drumBus), time + click * 0.045, 0.045 * velocity * (1 - click * 0.18), 0.001, 0.002, 0.035);
          s.oscillator('sine', 1850 - click * 90, time + click * 0.045, time + click * 0.045 + 0.05, env);
        }
      };
      const whistle = time => {
        // Yubibue: a finger whistle swooping up at the end of a phrase.
        const env = s.envelope(s.pan(0.5, whistleBus), time, 0.03, 0.05, 0.35, 0.25, 'linear');
        const tone = s.oscillator('sine', 1700, time, time + 0.8, env);
        tone.frequency.linearRampToValueAtTime(2650, time + 0.22);
        tone.frequency.setValueAtTime(2650, time + 0.42);
        tone.frequency.linearRampToValueAtTime(2300, time + 0.65);
        s.wobble(tone.detune, time + 0.22, time + 0.65, 25, 7);
      };
      const wave = (time, length, position) => {
        // A wave washing in and drawing back over the sand.
        const env = s.gain(0, s.pan(position, waveBus));
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(0.075, time + length * 0.35);
        env.gain.linearRampToValueAtTime(0.026, time + length * 0.7);
        env.gain.linearRampToValueAtTime(0, time + length);
        const tone = s.filter('lowpass', 500, env, 0.5);
        tone.frequency.setValueAtTime(400, time);
        tone.frequency.linearRampToValueAtTime(1800, time + length * 0.35);
        tone.frequency.linearRampToValueAtTime(700, time + length);
        s.noiseBurst(time, length + 0.1, tone, position + 1);
      };

      // Ryukyu scale: C E F G B. Chords stay within it where the melody leads.
      const chords = {
        C: { root: 36, keys: [64, 67, 72], pad: [48, 55, 64, 71] },
        F: { root: 41, keys: [65, 69, 72], pad: [53, 60, 64, 69] },
        G: { root: 43, keys: [62, 67, 71], pad: [55, 59, 62, 65] },
        Em: { root: 40, keys: [64, 67, 71], pad: [52, 59, 64, 67] },
        Am: { root: 45, keys: [64, 69, 72], pad: [57, 60, 64, 67] },
      };
      const progression = [
        'C', 'C', 'F', 'C',                       // intro
        'C', 'F', 'G', 'C', 'C', 'F', 'G', 'C',   // A
        'C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C',  // A'
        'F', 'Em', 'F', 'G', 'F', 'Em', 'Am', 'G', // B
        'C', 'F', 'G', 'C', 'F', 'G', 'C', 'C',   // A'' and turnaround
      ];
      // Sanshin melody: two-bar motifs, [beat, midi, beats].
      const motifs = {
        a: [[0, 72, 1], [1, 76, 0.5], [1.5, 77, 0.5], [2, 79, 1], [3, 76, 1], [4, 77, 0.5], [4.5, 76, 0.5], [5, 72, 1], [6, 71, 0.5], [6.5, 72, 1.5]],
        b: [[0, 79, 1], [1, 83, 0.5], [1.5, 84, 1.5], [3, 83, 0.5], [3.5, 79, 0.5], [4, 77, 1], [5, 76, 0.5], [5.5, 72, 0.5], [6, 76, 2]],
        c: [[0, 76, 0.5], [0.5, 77, 0.5], [1, 79, 1], [2, 77, 0.5], [2.5, 76, 0.5], [3, 72, 1], [4, 71, 1], [5, 67, 1], [6, 71, 0.5], [6.5, 72, 1.5]],
        d: [[0, 84, 1], [1, 83, 0.5], [1.5, 79, 0.5], [2, 77, 1], [3, 79, 1], [4, 76, 0.5], [4.5, 77, 0.5], [5, 76, 0.5], [5.5, 71, 0.5], [6, 72, 2]],
        intro: [[2, 72, 0.5], [2.5, 76, 0.5], [3, 79, 1], [5, 77, 0.5], [5.5, 76, 0.5], [6, 72, 2]],
        open: [[0.5, 72, 1], [1.5, 79, 1], [2.5, 84, 1.5], [4.5, 83, 0.5], [5, 79, 1], [6, 76, 2]],
        outro: [[0, 79, 1], [1, 77, 0.5], [1.5, 76, 0.5], [2, 72, 1.5], [4, 71, 0.5], [4.5, 72, 0.5], [5, 67, 1], [6, 72, 2]],
        answer: [[2.5, 84, 0.5], [3, 83, 0.5], [3.5, 79, 0.5]],
      };
      const melodyPlan = { 0: 'open', 2: 'intro', 4: 'a', 6: 'b', 8: 'a', 10: 'c', 12: 'a', 14: 'b', 16: 'c', 18: 'd', 21: 'answer', 23: 'answer', 25: 'answer', 28: 'a', 30: 'b', 32: 'c', 34: 'outro' };
      // B section: marimba counter-melody over held pads.
      const marimbaPlan = {
        20: [[0, 77, 1], [1.5, 76, 0.5], [2, 72, 1], [3, 76, 1]], 21: [[0, 79, 2], [2.5, 76, 0.5], [3, 71, 1]],
        22: [[0, 77, 1], [1.5, 79, 0.5], [2, 84, 1], [3, 83, 1]], 23: [[0, 79, 2], [2, 77, 0.5], [2.5, 76, 0.5], [3, 74, 1]],
        24: [[0, 77, 1], [1.5, 76, 0.5], [2, 72, 1], [3, 76, 1]], 25: [[0, 79, 2], [2.5, 83, 0.5], [3, 84, 1]],
        26: [[0, 81, 1.5], [1.5, 79, 0.5], [2, 76, 2]], 27: [[0, 77, 1], [1, 76, 1], [2, 74, 2]],
      };

      eachBar(this.bars, this.prerollBars, bar, (number, start) => {
        const chord = chords[progression[number]];
        const rng = random(6200 + number * 7919);
        const intro = number < 4;
        const bridge = number >= 20 && number < 28;
        if (number % 2 === 0) wave(start + rng() * 0.4, bar * 1.7, (rng() - 0.5) * 1.2);
        if (number % 4 === 0 || (bridge && number % 2 === 0)) pad(chord.pad, start, bar * (bridge ? 2 : 4));
        if (!intro) {
          // Bass: root, swung fifth, octave and a walking approach.
          bass(chord.root, at(start, 0) + 0.004, beat * 0.9);
          bass(chord.root + 7, at(start, 1.5), beat * 0.45, 0.8);
          bass(chord.root + 12, at(start, 2), beat * 0.8, 0.85);
          if (number % 2) bass(chord.root + 5, at(start, 3.5), beat * 0.4, 0.7);
          else bass(chord.root + 7, at(start, 3), beat * 0.8, 0.75);
          kick(start + 0.004, 0.85);
          kick(at(start, 2.5), 0.55);
          rim(at(start, 1), bridge ? 0.6 : 0.8);
          rim(at(start, 3), bridge ? 0.55 : 0.75);
          for (const position of [0.5, 1.5, 2.5, 3.5]) keys(chord.keys, at(start, position), (bridge ? 1.05 : 0.85) * (0.9 + rng() * 0.2));
          for (let step = 0; step < 8; step++) shaker(at(start, step / 2), step % 2 ? 0.8 : 1);
          if (number % 4 === 3) sanba(at(start, 3.5) - 0.02, 0.9);
        } else {
          // The intro: a held bass note, soft chords and the waves.
          bass(chord.root, start + 0.004, bar * 0.9, 0.7);
          keys(chord.keys, at(start, 0), 0.7);
          keys(chord.keys, at(start, 1.5), 0.45);
          keys(chord.keys, at(start, 2.5), 0.55);
          if (number % 2 === 1) sanba(at(start, 3.5) - 0.02, 0.6);
        }
        const motif = motifs[melodyPlan[number]];
        if (motif) {
          for (const [position, midi, length] of motif) {
            const accent = position % 1 === 0 ? 1 : 0.78;
            const hammer = length >= 1.5 && rng() < 0.5;
            s.pluck(sanshin, midi, at(start, position) + rng() * 0.01, 0.42 * accent, s.pan(0.12, twang), hammer ? { bend: 30, bendAt: 0.06, bendTime: 0.05 } : {});
          }
        }
        for (const [position, midi, length] of marimbaPlan[number] || []) {
          marimba(midi, at(start, position), 0.85);
          if (length >= 2) marimba(midi, at(start, position + 0.5), 0.45);
        }
        if (number === 27 || number === 11) whistle(at(start, 3) - 0.05);
      });
    },
  };

  // ---------------------------------------------------------------- Hokkaido
  const hokkaido = {
    bpm: 75, beatsPerBar: 3, bars: 40, prerollBars: 8, loudness: -17.5,
    studio: { seed: 4301, reverbSeconds: 5.5, reverbDecay: 0.95, reverbSmooth: 0.42, reverbTone: 6200, reverbLevel: 0.36, echoLeft: 0.8 * 0.75, echoRight: 0.8 * 0.5, ceiling: 11000, threshold: -21 },
    compose(s, { beat, bar }) {
      const boxBus = s.bus({ level: 0.6, room: 0.42, delay: 0.24, lowpass: 9000, highpass: 220 });
      const pianoBus = s.bus({ level: 0.75, room: 0.32, delay: 0.05, lowpass: 3600 });
      const padBus = s.bus({ level: 0.4, room: 0.55, lowpass: 2400 });
      const subBus = s.bus({ level: 0.7, room: 0.1, lowpass: 400 });
      const windBus = s.bus({ level: 0.35, room: 0.3, lowpass: 3000 });
      const bellBus = s.bus({ level: 0.32, room: 0.5, delay: 0.2, lowpass: 10000, highpass: 2500 });

      const musicBox = (midi, time, velocity = 1, position = 0.15) => {
        // Comb tine: a bright fundamental, its inharmonic partial and the pin click.
        const freq = midiHz(midi);
        const out = s.pan(position, boxBus);
        const tine = s.envelope(out, time, 0.05 * velocity, 0.002, 0.02, 2.4);
        s.oscillator('sine', freq, time, time + 2.5, tine);
        const twin = s.envelope(out, time, 0.018 * velocity, 0.002, 0.02, 2.0);
        s.oscillator('sine', freq * 1.0032, time, time + 2.1, twin);
        const partial = s.envelope(out, time, 0.012 * velocity, 0.001, 0, 0.32);
        s.oscillator('sine', freq * 5.93, time, time + 0.35, partial);
        const second = s.envelope(out, time, 0.008 * velocity, 0.001, 0, 0.6);
        s.oscillator('sine', freq * 3.01, time, time + 0.65, second);
        const click = s.envelope(out, time, 0.012 * velocity, 0.0005, 0.001, 0.012);
        s.noiseBurst(time, 0.03, s.filter('highpass', 5000, click), midi * 0.01);
      };
      const piano = (midi, time, velocity = 1, length = 2, position = -0.1) => {
        // Felt piano: soft hammer, quickly fading overtones, a long warm body.
        const freq = midiHz(midi);
        const out = s.pan(position + (midi - 60) * 0.012, pianoBus);
        const body = s.envelope(out, time, 0.05 * velocity, 0.008, 0.05, length + 1.2);
        s.oscillator('sine', freq, time, time + length + 1.4, body, -1.5);
        s.oscillator('triangle', freq, time, time + length + 1.4, s.gain(0.18, body), 2);
        const overtone = s.envelope(out, time, 0.016 * velocity, 0.006, 0, 0.7);
        s.oscillator('sine', freq * 2, time, time + 0.8, overtone, 3);
        const third = s.envelope(out, time, 0.007 * velocity, 0.004, 0, 0.3);
        s.oscillator('sine', freq * 3, time, time + 0.35, third);
        const felt = s.envelope(out, time, 0.008 * velocity, 0.002, 0.004, 0.04);
        s.noiseBurst(time, 0.06, s.filter('lowpass', 1600, felt), midi * 0.03);
      };
      const pad = (notes, time, length) => {
        notes.forEach((midi, index) => {
          const env = s.envelope(s.pan((index - 1.5) * 0.5, padBus), time, 0.0062, 1.6, Math.max(0, length - 2.4), 2.2, 'linear');
          const saw = s.oscillator('sawtooth', midiHz(midi), time, time + length + 0.4, env, -7 + index * 3);
          s.wobble(saw.detune, time, time + length + 0.4, 4, 0.12 + index * 0.02, -7 + index * 3);
          s.oscillator('sawtooth', midiHz(midi), time, time + length + 0.4, env, 8 - index * 2);
          // Octave shimmer, like light catching ice.
          s.oscillator('sine', midiHz(midi + 12), time, time + length + 0.4, s.gain(0.5, env), 5);
        });
      };
      const sub = (midi, time, length) => {
        const env = s.envelope(subBus, time, 0.013, 0.3, Math.max(0, length - 0.6), 0.9, 'linear');
        s.oscillator('sine', midiHz(midi), time, time + length + 1, env);
      };
      const wind = (time, length) => {
        const env = s.gain(0, s.pan(Math.sin(time) * 0.6, windBus));
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(0.03, time + length * 0.5);
        env.gain.linearRampToValueAtTime(0, time + length);
        const band = s.filter('bandpass', 500, env, 1.6);
        band.frequency.setValueAtTime(420, time);
        band.frequency.linearRampToValueAtTime(980, time + length * 0.55);
        band.frequency.linearRampToValueAtTime(520, time + length);
        s.noiseBurst(time, length + 0.1, band, time * 0.3);
      };
      const sparkle = (time, velocity) => {
        // A few sleigh-bell glints, far away.
        for (let index = 0; index < 4; index++) {
          const env = s.envelope(s.pan(0.55 - index * 0.25, bellBus), time + index * 0.07, 0.012 * velocity, 0.001, 0, 0.25);
          s.oscillator('sine', 3520 + index * 410, time + index * 0.07, time + index * 0.07 + 0.3, env);
          s.oscillator('sine', (3520 + index * 410) * 1.51, time + index * 0.07, time + index * 0.07 + 0.2, s.gain(0.5, env));
        }
      };

      // D major waltz with Lydian and suspended colors; one chord per two bars.
      const chords = [
        { bass: 38, voicing: [54, 57, 61, 64], pad: [57, 61, 64, 66] },  // Dmaj9
        { bass: 35, voicing: [54, 57, 61, 62], pad: [54, 57, 61, 62] },  // Bm9
        { bass: 31, voicing: [54, 59, 61, 62], pad: [54, 59, 61, 62] },  // Gmaj7#11
        { bass: 33, voicing: [52, 57, 59, 62], pad: [52, 57, 59, 64] },  // A6sus4
        { bass: 30, voicing: [52, 57, 61, 64], pad: [52, 57, 61, 64] },  // F#m7
        { bass: 35, voicing: [54, 57, 62, 66], pad: [54, 57, 62, 66] },  // Bm7
        { bass: 28, voicing: [54, 55, 59, 62], pad: [54, 59, 62, 66] },  // Em9
        { bass: 33, voicing: [55, 57, 59, 64], pad: [55, 59, 62, 64] },  // A7sus4
        { bass: 31, voicing: [54, 57, 59, 62], pad: [54, 57, 59, 62] },  // Gmaj7
        { bass: 30, voicing: [52, 57, 61, 64], pad: [52, 57, 61, 64] },  // F#m7
        { bass: 35, voicing: [54, 57, 62, 64], pad: [54, 57, 62, 64] },  // Bm11
        { bass: 33, voicing: [55, 57, 61, 64], pad: [55, 57, 61, 64] },  // A7
        { bass: 34, voicing: [53, 58, 62, 65], pad: [53, 58, 62, 65] },  // Bbmaj7 (a cold, borrowed turn)
        { bass: 31, voicing: [54, 59, 62, 64], pad: [54, 59, 62, 64] },  // G6
        { bass: 33, voicing: [55, 57, 61, 64], pad: [55, 57, 61, 64] },  // A7
        { bass: 38, voicing: [54, 57, 61, 64], pad: [57, 61, 64, 66] },  // Dmaj9
        { bass: 31, voicing: [54, 59, 61, 62], pad: [54, 59, 61, 62] },  // Gmaj7#11
        { bass: 35, voicing: [54, 57, 61, 62], pad: [54, 57, 61, 62] },  // Bm9
        { bass: 31, voicing: [54, 59, 61, 62], pad: [54, 59, 61, 62] },  // Gmaj7#11
        { bass: 33, voicing: [52, 57, 59, 62], pad: [52, 57, 59, 64] },  // A6sus4
      ];
      // Music-box melody, [bar, [[beat, midi, beats], ...]].
      const melody = new Map([
        [2, [[0, 81, 1], [1, 78, 1], [2, 76, 1]]], [3, [[0, 74, 2], [2, 76, 1]]],
        [4, [[0, 78, 1], [1, 81, 1], [2, 85, 1]]], [5, [[0, 83, 3]]],
        [6, [[0, 79, 1], [1, 83, 1], [2, 86, 1]]], [7, [[0, 85, 1.5], [1.5, 83, 0.5], [2, 81, 1]]],
        [8, [[0, 78, 1], [1, 76, 1], [2, 74, 1]]], [9, [[0, 76, 3]]],
        [10, [[0, 81, 1], [1, 86, 1], [2, 85, 1]]], [11, [[0, 83, 2], [2, 81, 1]]],
        [12, [[0, 79, 1], [1, 78, 1], [2, 76, 1]]], [13, [[0, 78, 2], [2, 74, 1]]],
        [14, [[0, 76, 1], [1, 78, 1], [2, 79, 1]]], [15, [[0, 81, 1], [1, 83, 1], [2, 85, 1]]],
        [32, [[0, 81, 1], [1, 78, 1], [2, 76, 1]]], [33, [[0, 74, 2], [2, 76, 1]]],
        [34, [[0, 78, 1], [1, 81, 1], [2, 85, 1]]], [35, [[0, 83, 3]]],
        [36, [[0, 79, 1], [1, 78, 1], [2, 76, 1]]], [37, [[0, 78, 2], [2, 81, 1]]],
        [38, [[0, 86, 3]]], [39, [[1, 81, 1], [2, 78, 1]]],
      ]);
      // Piano melody for the middle section, lower and slower.
      const pianoMelody = new Map([
        [16, [[0, 66, 1], [1, 69, 1], [2, 73, 1]]], [17, [[0, 71, 3]]],
        [18, [[0, 67, 1], [1, 71, 1], [2, 74, 1]]], [19, [[0, 73, 2], [2, 69, 1]]],
        [20, [[0, 69, 1], [1, 66, 1], [2, 64, 1]]], [21, [[0, 66, 3]]],
        [22, [[0, 62, 1], [1, 64, 1], [2, 66, 1]]], [23, [[0, 64, 3]]],
        [24, [[0, 65, 1], [1, 69, 1], [2, 74, 1]]], [25, [[0, 72, 2], [2, 70, 1]]],
        [26, [[0, 67, 1], [1, 71, 1], [2, 74, 1]]], [27, [[0, 73, 3]]],
        [28, [[0, 69, 1], [1, 73, 1], [2, 76, 1]]], [29, [[0, 74, 3]]],
        [30, [[0, 71, 1], [1, 69, 1], [2, 66, 1]]], [31, [[0, 64, 3]]],
      ]);

      eachBar(this.bars, this.prerollBars, bar, (number, start) => {
        const chord = chords[Math.floor(number / 2)];
        const rng = random(4400 + number * 7919);
        const quiet = number < 2 || number >= 38;
        const middle = number >= 16 && number < 32;
        if (number % 2 === 0) {
          pad(chord.pad, start, bar * 2);
          sub(chord.bass, start, bar * 2 - 0.2);
        }
        if (number % 4 === 0) wind(start + rng() * 0.5, bar * 3.2);
        // Waltz accompaniment: low note, then a soft broken chord.
        const voicing = chord.voicing;
        piano(chord.bass + 12, start + 0.006, quiet ? 0.45 : 0.62, bar * 0.9, -0.25);
        if (!quiet) {
          const pattern = middle ? [[1, [0, 2]], [2, [1, 3]]] : [[1, [1, 2]], [2, [0, 3]]];
          for (const [position, indexes] of pattern) {
            for (const index of indexes) piano(voicing[index] + (middle ? 0 : 12), start + position * beat + rng() * 0.012, middle ? 0.34 : 0.26, beat * 1.2, 0.12);
          }
        } else {
          piano(voicing[2] + 12, start + beat * 1.5, 0.22, beat * 2, 0.15);
        }
        for (const [position, midi] of melody.get(number) || []) musicBox(midi, start + position * beat + 0.01, 0.9 + rng() * 0.15, 0.2 - (midi - 80) * 0.02);
        for (const [position, midi, length] of pianoMelody.get(number) || []) piano(midi, start + position * beat + 0.012, 0.62, length * beat, -0.05);
        if (middle && number % 2 === 1) musicBox(chord.voicing[3] + 24, start + beat * 2.5, 0.42, 0.45);
        if (number % 8 === 7) sparkle(start + beat * 2.4, 0.9);
      });
    },
  };

  const scores = { kyoto, okinawa, hokkaido };
  window.renderThemeScore = theme => {
    if (!Object.hasOwn(scores, theme)) return Promise.reject(new Error(`Unknown score: ${theme}`));
    return renderScore(scores[theme]);
  };
  window.themeScoreInfo = Object.fromEntries(Object.entries(scores).map(([theme, score]) => [theme, {
    bpm: score.bpm, beatsPerBar: score.beatsPerBar, bars: score.bars, seconds: 60 / score.bpm * score.beatsPerBar * score.bars,
  }]));
})();
