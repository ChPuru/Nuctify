export type EQBand = { f: number; g: number };

export const EQ_PRESETS = {
  flat: [ {f: 32, g: 0}, {f: 64, g: 0}, {f: 125, g: 0}, {f: 250, g: 0}, {f: 500, g: 0}, {f: 1000, g: 0}, {f: 2000, g: 0}, {f: 4000, g: 0}, {f: 8000, g: 0}, {f: 16000, g: 0} ],
  bassBoost: [ {f: 32, g: 6}, {f: 64, g: 5}, {f: 125, g: 4}, {f: 250, g: 1}, {f: 500, g: 0}, {f: 1000, g: 0}, {f: 2000, g: 0}, {f: 4000, g: 0}, {f: 8000, g: 0}, {f: 16000, g: 0} ],
  electronic: [ {f: 32, g: 4}, {f: 64, g: 3}, {f: 125, g: 1}, {f: 250, g: -1}, {f: 500, g: -2}, {f: 1000, g: 0}, {f: 2000, g: 1}, {f: 4000, g: 3}, {f: 8000, g: 4}, {f: 16000, g: 5} ],
  acoustic: [ {f: 32, g: 2}, {f: 64, g: 2}, {f: 125, g: 1}, {f: 250, g: 1}, {f: 500, g: 2}, {f: 1000, g: 3}, {f: 2000, g: 3}, {f: 4000, g: 2}, {f: 8000, g: 2}, {f: 16000, g: 1} ],
};

export class AdvancedAudioEngine {
  private ctx: AudioContext | null = null;
  private primaryAudio: HTMLAudioElement;
  private secondaryAudio: HTMLAudioElement;

private primarySource: MediaElementAudioSourceNode | null = null;
  private secondarySource: MediaElementAudioSourceNode | null = null;

private primaryGain: GainNode | null = null;
  private secondaryGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

private eqNodes: BiquadFilterNode[] = [];

private isCrossfading = false;
  private crossfadeDuration = 3000;
  public activeDeck: 'A' | 'B' = 'A';

private sleepTimerInterval: number | ReturnType<typeof setInterval> | null = null;
  public sleepTimerEndMs: number | null = null;
  public onSleepTimerTick: (remainingMs: number | null) => void = () => {};

public onTimeUpdate: (currentTime: number, duration: number) => void = () => {};
  public onEnded: () => void = () => {};
  public onPlaying: () => void = () => {};
  public onWaiting: () => void = () => {};
  public onError: (e: ErrorEvent) => void = () => {};
  public onPreEnd: () => void = () => {};

constructor() {
    this.primaryAudio = new Audio();
    this.secondaryAudio = new Audio();

this.primaryAudio.crossOrigin = 'anonymous';
    this.secondaryAudio.crossOrigin = 'anonymous';
    this.primaryAudio.preload = 'auto';
    this.secondaryAudio.preload = 'auto';

this.setupEventListeners(this.primaryAudio, 'A');
    this.setupEventListeners(this.secondaryAudio, 'B');
  }

public async init() {
    if (this.ctx) return;

const inTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
    if (inTauri) {
      console.log('[AudioEngine] Tauri detected — skipping Web Audio API (EQ disabled, playback direct)');
      return;
    }

const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

this.ctx = new AudioContextClass();

this.primarySource = this.ctx.createMediaElementSource(this.primaryAudio);
    this.secondarySource = this.ctx.createMediaElementSource(this.secondaryAudio);

this.primaryGain = this.ctx.createGain();
    this.secondaryGain = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();

this.primaryGain.gain.value = 1;
    this.secondaryGain.gain.value = 0;

this.primarySource.connect(this.primaryGain);
    this.secondarySource.connect(this.secondaryGain);

this.primaryGain.connect(this.masterGain);
    this.secondaryGain.connect(this.masterGain);

this.setupEqualizer();

if (this.eqNodes.length > 0) {
      this.masterGain.connect(this.eqNodes[0]);
      this.eqNodes[this.eqNodes.length - 1].connect(this.ctx.destination);
    } else {
      this.masterGain.connect(this.ctx.destination);
    }

if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

private setupEqualizer() {
    if (!this.ctx) return;
    const freqs = EQ_PRESETS.flat.map(b => b.f);
    let prevNode: BiquadFilterNode | null = null;

freqs.forEach((freq, idx) => {
      const filter = this.ctx!.createBiquadFilter();
      filter.type = idx === 0 ? 'lowshelf' : (idx === freqs.length - 1 ? 'highshelf' : 'peaking');
      filter.frequency.value = freq;
      filter.gain.value = 0;

if (prevNode) {
        prevNode.connect(filter);
      }
      this.eqNodes.push(filter);
      prevNode = filter;
    });
  }

public setEQ(preset: EQBand[]) {
    if (this.eqNodes.length !== preset.length) return;
    this.eqNodes.forEach((node, i) => {

node.gain.setTargetAtTime(preset[i].g, this.ctx?.currentTime || 0, 0.1);
    });
  }

public getContext() {
    return this.ctx;
  }

private setupEventListeners(audio: HTMLAudioElement, deckId: 'A'|'B') {
    let preEndFired = false;

audio.addEventListener('play', () => {
      preEndFired = false;
    });

audio.addEventListener('timeupdate', () => {
      if (this.activeDeck !== deckId) return;
      this.onTimeUpdate(audio.currentTime, audio.duration || 0);

if (audio.duration > 15 && !preEndFired) {
        if (audio.duration - audio.currentTime <= (this.crossfadeDuration / 1000)) {
          preEndFired = true;
          this.onPreEnd();
        }
      }
    });

audio.addEventListener('ended', () => {
      if (this.activeDeck === deckId && !this.isCrossfading) {
        this.onEnded();
      }
    });

audio.addEventListener('playing', () => { if (this.activeDeck === deckId) this.onPlaying() });
    audio.addEventListener('waiting', () => { if (this.activeDeck === deckId) this.onWaiting() });
    audio.addEventListener('error', (e) => { if (this.activeDeck === deckId) this.onError(e) });
  }

public getActiveAudio() {
    return this.activeDeck === 'A' ? this.primaryAudio : this.secondaryAudio;
  }
  public getInactiveAudio() {
    return this.activeDeck === 'A' ? this.secondaryAudio : this.primaryAudio;
  }

public async playUrl(url: string, crossfade = false) {
    if (!this.ctx) await this.init();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();

if (!crossfade) {

const audio = this.getActiveAudio();
      audio.src = url;
      audio.load();
      await audio.play();
    } else {

this.isCrossfading = true;
      const dyingAudio = this.getActiveAudio();
      const newAudio = this.getInactiveAudio();

const dyingGain = this.activeDeck === 'A' ? this.primaryGain : this.secondaryGain;
      const newGain = this.activeDeck === 'A' ? this.secondaryGain : this.primaryGain;

newAudio.src = url;
      newAudio.load();

dyingGain?.gain.setValueAtTime(dyingGain.gain.value, this.ctx!.currentTime);
      dyingGain?.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + (this.crossfadeDuration / 1000));

newGain?.gain.setValueAtTime(0, this.ctx!.currentTime);
      newGain?.gain.linearRampToValueAtTime(1, this.ctx!.currentTime + (this.crossfadeDuration / 1000));

await newAudio.play();

this.activeDeck = this.activeDeck === 'A' ? 'B' : 'A';

setTimeout(() => {
        dyingAudio.pause();
        dyingAudio.src = '';
        dyingAudio.currentTime = 0;
        this.isCrossfading = false;
      }, this.crossfadeDuration);
    }
  }

public pause() {
    this.getActiveAudio().pause();
  }

public async resume() {
    if (!this.ctx) await this.init();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    return this.getActiveAudio().play();
  }

public seek(time: number) {
    this.getActiveAudio().currentTime = time;
  }

public setVolume(vol: number) {
    if (!this.ctx) {

this.primaryAudio.volume = vol;
      this.secondaryAudio.volume = vol;
      return;
    }

if (this.masterGain) {

const perceptV = vol * vol;
      this.masterGain.gain.setTargetAtTime(perceptV, this.ctx.currentTime, 0.05);
    }
  }

public startSleepTimer(minutes: number) {
    if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);

this.sleepTimerEndMs = Date.now() + (minutes * 60 * 1000);

this.sleepTimerInterval = setInterval(() => {
      const remaining = this.sleepTimerEndMs! - Date.now();

if (remaining <= 0) {

this.stopSleepTimer();
        this.onSleepTimerTick(0);

if (this.ctx && this.masterGain) {
          this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 5);
          setTimeout(() => {
            this.pause();

this.masterGain!.gain.value = 1; 
          }, 5000);
        } else {
          this.pause();
        }
      } else {
        this.onSleepTimerTick(remaining);
      }
    }, 1000);
  }

public stopSleepTimer() {
    if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
    this.sleepTimerInterval = null;
    this.sleepTimerEndMs = null;
    this.onSleepTimerTick(null);
  }
}

export const audioEngine = new AdvancedAudioEngine();
