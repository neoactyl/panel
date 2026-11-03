type Sound = "start" | "stop" | "restart" | "kill" | "error" | "success";

const SOUND_URLS: Record<Sound, string> = {
  start: "/sounds/start.wav",
  stop: "/sounds/stop.wav",
  restart: "/sounds/restart.wav",
  kill: "/sounds/kill.wav",
  error: "/sounds/error.wav",
  success: "/sounds/success.wav",
};

let enabled = true;
let audioCache = new Map<string, HTMLAudioElement>();

const getAudio = (sound: Sound): HTMLAudioElement => {
  let audio = audioCache.get(sound);
  if (!audio) {
    audio = new Audio(SOUND_URLS[sound]);
    audio.preload = "auto";
    audioCache.set(sound, audio);
  }
  return audio;
};

export const sound = {
  get enabled() {
    return enabled;
  },
  setEnabled: (next: boolean) => {
    enabled = next;
  },
  play: (soundName: Sound) => {
    if (!enabled) return;
    try {
      const audio = getAudio(soundName);
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Autoplay policy or missing asset; sound is optional feedback.
      });
    } catch {
      // Audio context unavailable; sound is optional feedback.
    }
  },
};
