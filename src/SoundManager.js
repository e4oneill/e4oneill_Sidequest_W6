// src/SoundManager.js
// Audio playback (SYSTEM layer).
//
// Responsibilities:
// - Load sound assets during preload() (via loadSound)
// - Play sounds by key (SFX/music)
// - Provide a simple abstraction so gameplay code never touches audio directly
//
// Non-goals:
// - Does NOT subscribe to EventBus directly (Game wires events → play())
// - Does NOT decide when events happen (WORLD logic emits events)
// - Does NOT manage UI
//
// Architectural notes:
// - Game connects EventBus events (leaf:collected, player:damaged, etc.) to SoundManager.play().
// - This keeps audio concerns isolated from gameplay and supports easy swapping/muting.

export class SoundManager {
  constructor() {
    this.sfx = {};
    this.music = null;
  }

  load(name, path, cueStart = 0) {
    loadSound(
      path,
      (sound) => {
        sound.setVolume(0.8);
        sound._cueStart = cueStart;
        this.sfx[name] = sound;
      },
      (err) => console.error(`[SoundManager] Failed to load "${name}":`, err)
    );
  }

  play(name) {
    const s = this.sfx[name];
    if (!s) return;
    if (s.isPlaying()) s.stop();
    s.play(0, 1, 1, s._cueStart || 0);
  }

  loadMusic(path) {
    loadSound(
      path,
      (sound) => { this.music = sound; },
      (err)   => console.error("[SoundManager] Failed to load music:", err)
    );
  }

  playMusic() {
    if (!this.music || this.music.isPlaying()) return;
    this.music.setLoop(true);
    this.music.setVolume(0.3);
    this.music.play();
  }
}