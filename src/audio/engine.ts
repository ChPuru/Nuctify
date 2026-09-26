export type EQBand = { f: number; g: number };

export const EQ_PRESETS = {
  flat: [ {f: 32, g: 0}, {f: 64, g: 0}, {f: 125, g: 0}, {f: 250, g: 0}, {f: 500, g: 0}, {f: 1000, g: 0}, {f: 2000, g: 0}, {f: 4000, g: 0}, {f: 8000, g: 0}, {f: 16000, g: 0} ],
  bassBoost: [ {f: 32, g: 6}, {f: 64, g: 5}, {f: 125, g: 4}, {f: 250, g: 1}, {f: 500, g: 0}, {f: 1000, g: 0}, {f: 2000, g: 0}, {f: 4000, g: 0}, {f: 8000, g: 0}, {f: 16000, g: 0} ],
  electronic: [ {f: 32, g: 4}, {f: 64, g: 3}, {f: 125, g: 1}, {f: 250, g: -1}, {f: 500, g: -2}, {f: 1000, g: 0}, {f: 2000, g: 1}, {f: 4000, g: 3}, {f: 8000, g: 4}, {f: 16000, g: 5} ],
  acoustic: [ {f: 32, g: 2}, {f: 64, g: 2}, {f: 125, g: 1}, {f: 250, g: 1}, {f: 500, g: 2}, {f: 1000, g: 3}, {f: 2000, g: 3}, {f: 4000, g: 2}, {f: 8000, g: 2}, {f: 16000, g: 1} ],
  vocalBooster: [ {f: 32, g: -2}, {f: 64, g: -2}, {f: 125, g: -1}, {f: 250, g: 1}, {f: 500, g: 3}, {f: 1000, g: 4}, {f: 2000, g: 4}, {f: 4000, g: 3}, {f: 8000, g: 1}, {f: 16000, g: 0} ],
};

type Deck = 'A' | 'B' | 'P';

export class AdvancedAudioEngine {
  private ctx: AudioContext | null = null;
  private primaryAudio: HTMLAudioElement;
  private secondaryAudio: HTMLAudioElement;
  private plainAudio: HTMLAudioElement;

  private primaryGain: GainNode | null = null;
  private secondaryGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private eqNodes: BiquadFilterNode[] = [];
  private eqBands: EQBand[] = EQ_PRESETS.flat;
  private compressorNode: DynamicsCompressorNode | null = null;
  private normalizationEnabled = false;
  private currentPlaybackRate = 1.0;
  private volume = 1;

  private isCrossfading = false;
  private fadingDeck: Deck | null = null;
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  private crossfadeDuration = 3000;
  private loadToken = 0;
  private pendingDeck: Deck | null = null;
  private handoffDeck: Deck | null = null;
  public activeDeck: Deck = 'A';

  private sleepTimerInterval: ReturnType<typeof setInterval> | null = null;
  public sleepTimerEndMs: number | null = null;
  public onSleepTimerTick: (remainingMs: number | null) => void = () => {};

  public onTimeUpdate: (currentTime: number, duration: number) => void = () => {};
  public onEnded: () => void = () => {};
  public onPlaying: () => void = () => {};
  public onWaiting: () => void = () => {};
  public onError: (e: Event) => void = () => {};
  public onPreEnd: () => boolean = () => false;

  constructor() {
    this.primaryAudio = new Audio();
    this.secondaryAudio = new Audio();
    this.plainAudio = new Audio();

    this.primaryAudio.crossOrigin = 'anonymous';
    this.secondaryAudio.crossOrigin = 'anonymous';
    for (const a of [this.primaryAudio, this.secondaryAudio, this.plainAudio]) a.preload = 'auto';

    this.setupEventListeners(this.primaryAudio, 'A');
    this.setupEventListeners(this.secondaryAudio, 'B');
    this.setupEventListeners(this.plainAudio, 'P');
  }

  public async init() {
    if (this.ctx) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      this.ctx = new AudioContextClass({ latencyHint: 'playback' });
    } catch {
      return;
    }
    const ctx = this.ctx!;

    const primarySource = ctx.createMediaElementSource(this.primaryAudio);
    const secondarySource = ctx.createMediaElementSource(this.secondaryAudio);

    this.primaryGain = ctx.createGain();
    this.secondaryGain = ctx.createGain();
    this.masterGain = ctx.createGain();

    this.primaryGain.gain.value = this.activeDeck === 'A' ? 1 : 0;
    this.secondaryGain.gain.value = this.activeDeck === 'B' ? 1 : 0;
    this.masterGain.gain.value = this.volume * this.volume;
    this.primaryAudio.volume = 1;
    this.secondaryAudio.volume = 1;

    primarySource.connect(this.primaryGain);
    secondarySource.connect(this.secondaryGain);

    this.primaryGain.connect(this.masterGain);
    this.secondaryGain.connect(this.masterGain);

    this.setupEqualizer();

    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -24;
    this.compressorNode.knee.value = 30;
    this.compressorNode.ratio.value = this.normalizationEnabled ? 12 : 1;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.25;

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;

    if (this.eqNodes.length > 0) {
      this.masterGain.connect(this.eqNodes[0]);
      this.eqNodes[this.eqNodes.length - 1].connect(this.compressorNode);
    } else {
      this.masterGain.connect(this.compressorNode);
    }
    this.compressorNode.connect(this.analyserNode);
    this.analyserNode.connect(ctx.destination);

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
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
      filter.gain.value = this.eqBands[idx]?.g ?? 0;

      if (prevNode) {
        prevNode.connect(filter);
      }
      this.eqNodes.push(filter);
      prevNode = filter;
    });
  }

  public setEQ(preset: EQBand[]) {
    if (preset.length !== EQ_PRESETS.flat.length) return;
    this.eqBands = preset;
    this.eqNodes.forEach((node, i) => {
      node.gain.setTargetAtTime(preset[i].g, this.ctx?.currentTime || 0, 0.1);
    });
  }

  public getContext() {
    return this.ctx;
  }

  private el(deck: Deck) {
    return deck === 'A' ? this.primaryAudio : deck === 'B' ? this.secondaryAudio : this.plainAudio;
  }

  private gainOf(deck: Deck) {
    return deck === 'A' ? this.primaryGain : deck === 'B' ? this.secondaryGain : null;
  }

  private usesWebAudio(deck: Deck) {
    return deck !== 'P' && !!this.ctx;
  }

  private stopElement(audio: HTMLAudioElement) {
    audio.pause();
    if (audio.getAttribute('src')) {
      audio.removeAttribute('src');
      audio.load();
    }
  }

  private setGain(deck: Deck, value: number) {
    const g = this.gainOf(deck);
    if (!g || !this.ctx) return;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(value, t);
  }

  private finishCrossfade() {
    if (this.crossfadeTimer) clearTimeout(this.crossfadeTimer);
    this.crossfadeTimer = null;
    const dying = this.fadingDeck;
    this.fadingDeck = null;
    this.isCrossfading = false;
    if (dying && dying !== this.activeDeck) {
      this.stopElement(this.el(dying));
      this.setGain(dying, 0);
      this.setGain(this.activeDeck, 1);
    }
  }

  private setupEventListeners(audio: HTMLAudioElement, deckId: Deck) {
    let preEndFired = false;

    const report = () => {
      if (this.activeDeck !== deckId) return;
      const d = isFinite(audio.duration) ? audio.duration : 0;
      this.onTimeUpdate(audio.currentTime, d);
      if (
        !preEndFired && !audio.paused && d > 15 && this.pendingDeck === null && this.usesWebAudio(deckId) &&
        d - audio.currentTime <= this.crossfadeDuration / 1000
      ) {
        preEndFired = true;
        if (this.onPreEnd()) this.handoffDeck = deckId;
      }
    };

    audio.addEventListener('loadstart', () => {
      preEndFired = false;
      if (this.handoffDeck === deckId) this.handoffDeck = null;
    });
    audio.addEventListener('timeupdate', report);
    audio.addEventListener('durationchange', report);

    audio.addEventListener('ended', () => {
      if (this.handoffDeck === deckId) {
        this.handoffDeck = null;
        return;
      }
      if (this.activeDeck === deckId && !this.isCrossfading) this.onEnded();
    });

    audio.addEventListener('playing', () => { if (this.activeDeck === deckId) this.onPlaying(); });
    audio.addEventListener('waiting', () => { if (this.activeDeck === deckId) this.onWaiting(); });
    audio.addEventListener('error', (e) => {
      if (this.activeDeck === deckId && this.pendingDeck !== deckId && audio.getAttribute('src')) this.onError(e);
    });
  }

  public getActiveAudio() {
    return this.el(this.activeDeck);
  }

  public getInactiveAudio() {
    return this.el(this.activeDeck === 'A' ? 'B' : 'A');
  }

  public async playUrl(url: string, opts: { crossfade?: boolean; cors?: boolean } = {}) {
    const token = ++this.loadToken;
    this.finishCrossfade();

    const webAudio = opts.cors !== false;
    if (webAudio) {
      if (!this.ctx) await this.init();
      if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});
      if (token !== this.loadToken) return;
    }

    const prev = this.activeDeck;
    const prevEl = this.el(prev);
    const target: Deck = webAudio ? (prev === 'A' ? 'B' : 'A') : 'P';
    const audio = this.el(target);
    const crossfade = !!opts.crossfade && prev !== target && this.usesWebAudio(prev) && !prevEl.paused;

    if (!crossfade && prev !== target) {
      this.stopElement(prevEl);
      this.setGain(prev, 0);
    }
    this.setGain(target, crossfade ? 0 : 1);

    this.activeDeck = target;
    this.pendingDeck = target;
    audio.src = url;
    audio.defaultPlaybackRate = this.currentPlaybackRate;
    audio.playbackRate = this.currentPlaybackRate;
    audio.volume = this.usesWebAudio(target) ? 1 : this.volume * this.volume;

    try {
      await audio.play();
    } catch (e) {
      if (token === this.loadToken) {
        this.pendingDeck = null;
        this.stopElement(audio);
        if (crossfade) this.activeDeck = prev;
      }
      throw e;
    }

    if (token !== this.loadToken) return;
    this.pendingDeck = null;
    audio.playbackRate = this.currentPlaybackRate;

    if (crossfade && this.ctx) {
      const t = this.ctx.currentTime;
      const d = this.crossfadeDuration / 1000;
      const dying = this.gainOf(prev)!;
      dying.gain.cancelScheduledValues(t);
      dying.gain.setValueAtTime(dying.gain.value, t);
      dying.gain.linearRampToValueAtTime(0, t + d);
      const incoming = this.gainOf(target);
      if (incoming) {
        incoming.gain.cancelScheduledValues(t);
        incoming.gain.setValueAtTime(0, t);
        incoming.gain.linearRampToValueAtTime(1, t + d);
      }
      this.isCrossfading = true;
      this.fadingDeck = prev;
      this.crossfadeTimer = setTimeout(() => this.finishCrossfade(), this.crossfadeDuration);
    }
  }

  public pause() {
    this.finishCrossfade();
    this.getActiveAudio().pause();
  }

  public async resume() {
    if (this.activeDeck !== 'P') {
      if (!this.ctx) await this.init();
      if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});
    }
    return this.getActiveAudio().play();
  }

  public seek(time: number) {
    if (isFinite(time)) this.getActiveAudio().currentTime = Math.max(0, time);
  }

  public hasSource() {
    return !!this.getActiveAudio().getAttribute('src');
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    const perceptV = this.volume * this.volume;
    this.plainAudio.volume = perceptV;
    if (!this.ctx || !this.masterGain) {
      this.primaryAudio.volume = perceptV;
      this.secondaryAudio.volume = perceptV;
      return;
    }
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(perceptV, t, 0.05);
  }

  public setPlaybackRate(rate: number) {
    this.currentPlaybackRate = rate;
    for (const a of [this.primaryAudio, this.secondaryAudio, this.plainAudio]) {
      a.defaultPlaybackRate = rate;
      a.playbackRate = rate;
    }
  }

  public getPlaybackRate(): number {
    return this.currentPlaybackRate;
  }

  public setNormalization(enabled: boolean) {
    this.normalizationEnabled = enabled;
    if (!this.compressorNode || !this.ctx) return;
    this.compressorNode.ratio.setTargetAtTime(
      enabled ? 12 : 1,
      this.ctx.currentTime,
      0.1
    );
  }

  public startSleepTimer(minutes: number) {
    if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);

    this.sleepTimerEndMs = Date.now() + (minutes * 60 * 1000);

    this.sleepTimerInterval = setInterval(() => {
      const remaining = this.sleepTimerEndMs! - Date.now();

      if (remaining <= 0) {
        this.stopSleepTimer();
        this.onSleepTimerTick(0);

        if (this.ctx && this.masterGain && this.usesWebAudio(this.activeDeck)) {
          const t = this.ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(t);
          this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
          this.masterGain.gain.linearRampToValueAtTime(0, t + 5);
          setTimeout(() => {
            this.pause();
            this.setVolume(this.volume);
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

  public getAnalyser() {
    return this.analyserNode;
  }
}

export const audioEngine = new AdvancedAudioEngine();
