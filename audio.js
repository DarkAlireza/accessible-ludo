/**
 * LudoAudio - Pure procedural Web Audio API sound synthesis & self-voicing helper
 * Specially designed for blind & screen-reader accessible Web Ludo.
 *
 * Provides distinct auditory cues (earcons) for all game events:
 * - Dice rolls with audible value counting (1-6)
 * - Yard exits, standard steps, captures, home entries, and safe zones
 * - Distinct player timbres/octaves (Red, Green, Yellow, Blue)
 * - Turn start chimes (human vs AI)
 * - Celebratory win fanfare & gentle error earcons
 * - Web Speech API self-voicing fallback
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LudoAudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let isMutedState = false;
  let volumeState = 0.75;
  let selfVoicingState = false;

  // Player tone signatures (base frequencies & waveforms)
  // 0: Red, 1: Green, 2: Yellow, 3: Blue
  const PLAYER_SIGNATURES = [
    { name: 'Red', baseFreq: 220.00, wave: 'triangle' },     // A3 - warm brassy
    { name: 'Green', baseFreq: 293.66, wave: 'sine' },       // D4 - mellow woody
    { name: 'Yellow', baseFreq: 392.00, wave: 'triangle' },   // G4 - bright chime
    { name: 'Blue', baseFreq: 329.63, wave: 'sawtooth' }     // E4 - resonant pluck
  ];

  // Helper to ensure AudioContext is initialized and running
  function getContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!ctx) {
      try {
        ctx = new AudioCtx();
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(isMutedState ? 0 : volumeState, ctx.currentTime);
        masterGain.connect(ctx.destination);
      } catch (e) {
        return null;
      }
    }

    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    return ctx;
  }

  // Generate short noise burst for dice clicks and percussive hits
  function playNoiseBurst(time, duration, gainVal, highpass) {
    duration = duration || 0.02;
    gainVal = gainVal || 0.3;
    highpass = highpass || 1000;

    const c = getContext();
    if (!c || isMutedState || !masterGain) return;

    try {
      const bufferSize = Math.max(256, Math.floor(c.sampleRate * duration));
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }

      const noise = c.createBufferSource();
      noise.buffer = buffer;

      const filter = c.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(highpass, time);

      const gain = c.createGain();
      gain.gain.setValueAtTime(gainVal, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      noise.start(time);
      noise.stop(time + duration);
    } catch (e) {
      // AudioContext fallback
    }
  }

  // Helper to schedule a shaped tone
  function playTone(options) {
    const freq = options.freq || 440;
    const type = options.type || 'sine';
    const duration = options.duration || 0.1;
    const gain = options.gain || 0.3;
    const endFreq = options.endFreq || null;
    const attack = options.attack || 0.01;
    const decay = options.decay || (duration - attack);

    const c = getContext();
    if (!c || isMutedState || !masterGain) return;

    try {
      const t = options.startTime || c.currentTime;
      const osc = c.createOscillator();
      const env = c.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      }

      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(gain, t + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0.01, decay));

      osc.connect(env);
      env.connect(masterGain);

      osc.start(t);
      osc.stop(t + duration + 0.05);
    } catch (e) {
      // safe fallback
    }
  }

  const LudoAudio = {
    /**
     * Initializes or resumes the AudioContext on user interaction.
     */
    init: function () {
      const c = getContext();
      if (c && c.state === 'suspended') {
        return c.resume().then(() => true).catch(() => false);
      }
      return Promise.resolve(!!c);
    },

    /**
     * Set volume between 0.0 and 1.0.
     */
    setVolume: function (val) {
      volumeState = Math.max(0, Math.min(1, Number(val) || 0));
      if (masterGain && ctx) {
        try {
          masterGain.gain.setValueAtTime(isMutedState ? 0 : volumeState, ctx.currentTime);
        } catch (e) {}
      }
    },

    /**
     * Get current volume (0.0 to 1.0).
     */
    getVolume: function () {
      return volumeState;
    },

    /**
     * Set mute state.
     */
    setMuted: function (muted) {
      isMutedState = Boolean(muted);
      if (masterGain && ctx) {
        try {
          masterGain.gain.setValueAtTime(isMutedState ? 0 : volumeState, ctx.currentTime);
        } catch (e) {}
      }
    },

    /**
     * Check if audio is muted.
     */
    isMuted: function () {
      return isMutedState;
    },

    /**
     * Toggle mute state. Returns new muted state.
     */
    toggleMute: function () {
      this.setMuted(!isMutedState);
      return isMutedState;
    },

    /**
     * Plays dice rolling sound (tactile rattling clicks) followed by
     * `value` musical notes so blind players can count the roll by ear,
     * with a special triumphant chord on 6.
     * @param {number} value (1 to 6)
     */
    playDiceRoll: function (value) {
      const c = getContext();
      if (!c || isMutedState) return;

      const now = c.currentTime;
      const rollVal = Math.max(1, Math.min(6, Math.floor(value || 1)));

      // 1. Crisp dice rattle: 4 micro-clicks simulating wooden dice tumble
      const rattleTimes = [0.00, 0.04, 0.09, 0.14];
      rattleTimes.forEach(function (dt, idx) {
        playNoiseBurst(now + dt, 0.02, 0.25 - idx * 0.04, 800 + idx * 300);
        playTone({
          freq: 350 - idx * 40,
          type: 'triangle',
          startTime: now + dt,
          duration: 0.03,
          gain: 0.15,
          attack: 0.002,
          decay: 0.025
        });
      });

      // 2. Value melody starting right after the rattle
      const noteStart = now + 0.22;
      // Musical pentatonic scale for values 1-6:
      // 1: C5 (523.25)
      // 2: D5 (587.33)
      // 3: E5 (659.25)
      // 4: G5 (783.99)
      // 5: A5 (880.00)
      // 6: C6 (1046.50)
      const NOTES = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
      const stepInterval = 0.09;

      if (rollVal < 6) {
        // Play sequence of notes up to rollVal
        for (let i = 0; i < rollVal; i++) {
          const t = noteStart + i * stepInterval;
          const freq = NOTES[i];
          playTone({
            freq: freq,
            type: 'sine',
            startTime: t,
            duration: 0.08,
            gain: 0.28,
            attack: 0.005,
            decay: 0.075
          });
          playTone({
            freq: freq * 2,
            type: 'sine',
            startTime: t,
            duration: 0.04,
            gain: 0.08,
            attack: 0.005,
            decay: 0.035
          });
        }
      } else {
        // Special roll of 6! Rapid ascending arpeggio + triumphant C-major chord
        for (let i = 0; i < 6; i++) {
          const t = noteStart + i * 0.055;
          playTone({
            freq: NOTES[i],
            type: 'sine',
            startTime: t,
            duration: 0.06,
            gain: 0.25,
            attack: 0.004,
            decay: 0.05
          });
        }
        // Resonant chord at end of 6
        const chordTime = noteStart + 6 * 0.055 + 0.02;
        const chordPitches = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        chordPitches.forEach(function (pitch) {
          playTone({
            freq: pitch,
            type: 'triangle',
            startTime: chordTime,
            duration: 0.35,
            gain: 0.2,
            attack: 0.01,
            decay: 0.34
          });
        });
      }
    },

    /**
     * Plays appropriate earcon for a move based on moveResult:
     * - isExitYard: Rising bright arpeggio
     * - isCapture: Dramatic descending sweep + percussive hit
     * - isHomeEntry: Triumphant brass/bell fanfare
     * - isSafeDestination: Warm harmonic shimmer chord
     * - Standard move: Pitched step with player's color signature
     * @param {number} playerIndex (0=Red, 1=Green, 2=Yellow, 3=Blue)
     * @param {object} moveResult (from LudoEngine.applyMove)
     */
    playMove: function (playerIndex, moveResult) {
      const c = getContext();
      if (!c || isMutedState) return;

      const pIdx = (Number(playerIndex) || 0) % 4;
      const signature = PLAYER_SIGNATURES[pIdx] || PLAYER_SIGNATURES[0];
      const now = c.currentTime;
      const res = moveResult || {};

      if (res.isExitYard) {
        // Bright rising arpeggio: Token springing out into the board!
        const base = signature.baseFreq * 1.5;
        const arpeggio = [base, base * 1.25, base * 1.5, base * 2.0];
        arpeggio.forEach(function (freq, i) {
          const t = now + i * 0.06;
          playTone({
            freq: freq,
            type: 'triangle',
            startTime: t,
            duration: 0.12,
            gain: 0.3,
            attack: 0.008,
            decay: 0.11
          });
          playTone({
            freq: freq * 2,
            type: 'sine',
            startTime: t,
            duration: 0.08,
            gain: 0.12,
            attack: 0.005,
            decay: 0.075
          });
        });
      } else if (res.isCapture) {
        // Dramatic capture: snappy impact + descending sweep
        playNoiseBurst(now, 0.08, 0.5, 400);
        playTone({
          freq: 180,
          endFreq: 45,
          type: 'sawtooth',
          startTime: now,
          duration: 0.18,
          gain: 0.45,
          attack: 0.002,
          decay: 0.17
        });
        playTone({
          freq: 650,
          endFreq: 110,
          type: 'triangle',
          startTime: now + 0.02,
          duration: 0.28,
          gain: 0.35,
          attack: 0.01,
          decay: 0.27
        });
      } else if (res.toStep === 56) {
        // Triumphant Home fanfare: Token reaching the central goal (56)!
        const fanfareNotes = [
          { f: 523.25, t: 0.00, d: 0.12 }, // C5
          { f: 659.25, t: 0.10, d: 0.12 }, // E5
          { f: 783.99, t: 0.20, d: 0.14 }, // G5
          { f: 1046.50, t: 0.32, d: 0.45 } // C6
        ];
        fanfareNotes.forEach(function (n) {
          playTone({
            freq: n.f,
            type: 'triangle',
            startTime: now + n.t,
            duration: n.d,
            gain: 0.35,
            attack: 0.01,
            decay: n.d - 0.01
          });
          playTone({
            freq: n.f * 1.5,
            type: 'sine',
            startTime: now + n.t,
            duration: n.d * 0.7,
            gain: 0.15,
            attack: 0.01,
            decay: n.d * 0.7 - 0.01
          });
        });
      } else if (res.isSafeDestination) {
        // Warm harmonic shimmer chord: Sanctuary on star/starting square
        const safePitches = [392.00, 493.88, 587.33, 783.99]; // G4, B4, D5, G5
        safePitches.forEach(function (freq, idx) {
          playTone({
            freq: freq,
            type: 'sine',
            startTime: now + idx * 0.03,
            duration: 0.4,
            gain: 0.22,
            attack: 0.04,
            decay: 0.36
          });
          playTone({
            freq: freq * 1.005,
            type: 'triangle',
            startTime: now + idx * 0.03,
            duration: 0.38,
            gain: 0.1,
            attack: 0.05,
            decay: 0.33
          });
        });
      } else {
        // Standard step sound: tactile piece tap with player signature frequency
        let baseFreq = signature.baseFreq;
        if (res.isHomeStretch) {
          baseFreq *= 1.5;
        }

        playNoiseBurst(now, 0.015, 0.15, 1200);
        playTone({
          freq: baseFreq,
          type: signature.wave,
          startTime: now + 0.005,
          duration: 0.09,
          gain: 0.3,
          attack: 0.005,
          decay: 0.085
        });
        playTone({
          freq: baseFreq * 1.5,
          type: 'sine',
          startTime: now + 0.015,
          duration: 0.06,
          gain: 0.12,
          attack: 0.005,
          decay: 0.055
        });
      }
    },

    /**
     * Subtle two-tone cue at turn start:
     * - Warmer & brighter when isHuman=true ("Your turn to play!")
     * - Softer & lower when isHuman=false (AI turn notification)
     * @param {number} playerIndex (0=Red, 1=Green, 2=Yellow, 3=Blue)
     * @param {boolean} isHuman
     */
    playTurnStart: function (playerIndex, isHuman) {
      const c = getContext();
      if (!c || isMutedState) return;

      const now = c.currentTime;
      const pIdx = (Number(playerIndex) || 0) % 4;
      const signature = PLAYER_SIGNATURES[pIdx] || PLAYER_SIGNATURES[0];

      if (isHuman) {
        // Uplifting bright two-tone cue: rising fourth
        const note1 = signature.baseFreq * 1.5;
        const note2 = note1 * 1.333;
        playTone({
          freq: note1,
          type: 'sine',
          startTime: now,
          duration: 0.1,
          gain: 0.28,
          attack: 0.01,
          decay: 0.09
        });
        playTone({
          freq: note2,
          type: 'triangle',
          startTime: now + 0.09,
          duration: 0.22,
          gain: 0.32,
          attack: 0.01,
          decay: 0.21
        });
        playTone({
          freq: note2 * 2,
          type: 'sine',
          startTime: now + 0.09,
          duration: 0.15,
          gain: 0.1,
          attack: 0.01,
          decay: 0.14
        });
      } else {
        // Gentle, soft low blip for AI turn so blind players hear turn passing without intrusion
        const base = signature.baseFreq * 0.9;
        playTone({
          freq: base,
          type: 'sine',
          startTime: now,
          duration: 0.06,
          gain: 0.12,
          attack: 0.005,
          decay: 0.055
        });
        playTone({
          freq: base * 0.85,
          type: 'sine',
          startTime: now + 0.06,
          duration: 0.08,
          gain: 0.1,
          attack: 0.005,
          decay: 0.075
        });
      }
    },

    /**
     * Celebratory multi-bar victory melody when a player wins the game!
     */
    playWin: function () {
      const c = getContext();
      if (!c || isMutedState) return;

      const now = c.currentTime;
      const melody = [
        { f: 523.25, t: 0.00, d: 0.12 }, // C5
        { f: 659.25, t: 0.13, d: 0.12 }, // E5
        { f: 783.99, t: 0.26, d: 0.18 }, // G5
        { f: 1046.50, t: 0.46, d: 0.28 }, // C6
        { f: 880.00, t: 0.78, d: 0.14 }, // A5
        { f: 1046.50, t: 0.94, d: 0.38 }, // C6
        { f: 783.99, t: 1.36, d: 0.12 }, // G5
        { f: 880.00, t: 1.50, d: 0.12 }, // A5
        { f: 1046.50, t: 1.64, d: 0.14 }, // C6
        { f: 1174.66, t: 1.80, d: 0.16 }, // D6
        { f: 1318.51, t: 1.98, d: 0.45 }  // E6
      ];

      melody.forEach(function (m) {
        playTone({
          freq: m.f,
          type: 'triangle',
          startTime: now + m.t,
          duration: m.d,
          gain: 0.32,
          attack: 0.01,
          decay: m.d - 0.01
        });
        playTone({
          freq: m.f * 0.5,
          type: 'sine',
          startTime: now + m.t,
          duration: m.d,
          gain: 0.18,
          attack: 0.01,
          decay: m.d - 0.01
        });
      });

      const finaleTime = now + 2.45;
      const finalePitches = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      finalePitches.forEach(function (pitch) {
        playTone({
          freq: pitch,
          type: 'triangle',
          startTime: finaleTime,
          duration: 0.9,
          gain: 0.22,
          attack: 0.02,
          decay: 0.88
        });
      });
    },

    /**
     * Gentle low double-tone for invalid shortcut, unavailable action, or blocked move.
     */
    playError: function () {
      const c = getContext();
      if (!c || isMutedState) return;

      const now = c.currentTime;
      playTone({
        freq: 160,
        type: 'sine',
        startTime: now,
        duration: 0.09,
        gain: 0.25,
        attack: 0.01,
        decay: 0.08
      });
      playTone({
        freq: 130,
        type: 'sine',
        startTime: now + 0.10,
        duration: 0.14,
        gain: 0.25,
        attack: 0.01,
        decay: 0.13
      });
    },

    /**
     * Web Speech API self-voicing helpers.
     */
    setSelfVoicing: function (enabled) {
      selfVoicingState = Boolean(enabled);
      if (!selfVoicingState && typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
    },

    isSelfVoicing: function () {
      return selfVoicingState;
    },

    toggleSelfVoicing: function () {
      this.setSelfVoicing(!selfVoicingState);
      return selfVoicingState;
    },

    /**
     * Speaks text aloud if self-voicing is enabled.
     * @param {string} text Text to speak
     * @param {boolean} interrupt If true, cancels ongoing speech before speaking
     */
    speak: function (text, interrupt) {
      if (interrupt === undefined) interrupt = true;
      if (!selfVoicingState) return;
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      if (!text || typeof text !== 'string') return;

      try {
        if (interrupt) {
          window.speechSynthesis.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        // Gracefully ignore speech synthesis errors
      }
    }
  };

  return LudoAudio;
});
