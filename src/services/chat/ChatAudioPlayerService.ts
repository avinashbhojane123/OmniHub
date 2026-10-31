export interface AudioPlayerState {
  activeId: string | number | null;
  url: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  playbackRate: number;
}

type AudioPlayerListener = (state: AudioPlayerState) => void;

class ChatAudioPlayerManager {
  private state: AudioPlayerState = {
    activeId: null,
    url: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    playbackRate: 1,
  };

  private listeners: Set<AudioPlayerListener> = new Set();
  private postMessageSender: ((message: string) => void) | null = null;

  public get getState(): AudioPlayerState {
    return { ...this.state };
  }

  public registerSender(sender: (message: string) => void) {
    this.postMessageSender = sender;
  }

  public unregisterSender() {
    this.postMessageSender = null;
  }

  public subscribe(listener: AudioPlayerListener): () => void {
    this.listeners.add(listener);
    listener(this.getState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = this.getState;
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch (err) {
        console.warn('AudioPlayer listener error:', err);
      }
    });
  }

  public play(url: string, id: string | number) {
    if (this.state.activeId === id && this.state.isPlaying) {
      this.pause();
      return;
    }

    if (this.state.activeId === id && !this.state.isPlaying && this.state.url === url) {
      this.resume();
      return;
    }

    this.state = {
      ...this.state,
      activeId: id,
      url,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      isLoading: true,
    };
    this.notify();

    if (this.postMessageSender) {
      this.postMessageSender(
        JSON.stringify({
          command: 'play',
          url,
          id,
          rate: this.state.playbackRate,
        })
      );
    }
  }

  public setPlaybackRate(rate: number) {
    this.state.playbackRate = rate;
    this.notify();
    if (this.postMessageSender) {
      this.postMessageSender(JSON.stringify({ command: 'rate', rate }));
    }
  }

  public pause() {
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    this.notify();
    if (this.postMessageSender) {
      this.postMessageSender(JSON.stringify({ command: 'pause' }));
    }
  }

  public resume() {
    if (this.state.isPlaying || !this.state.url) return;
    this.state.isPlaying = true;
    this.notify();
    if (this.postMessageSender) {
      this.postMessageSender(JSON.stringify({ command: 'resume' }));
    }
  }

  public stop() {
    this.state = {
      activeId: null,
      url: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isLoading: false,
      playbackRate: this.state.playbackRate || 1,
    };
    this.notify();
    if (this.postMessageSender) {
      this.postMessageSender(JSON.stringify({ command: 'stop' }));
    }
  }

  // Handle messages from the hidden WebView audio player bridge
  public handleBridgeMessage(message: any) {
    if (!message || typeof message !== 'object') return;

    switch (message.type) {
      case 'loaded':
        this.state.duration = Math.max(0, Number(message.duration) || 0);
        this.state.isLoading = false;
        this.notify();
        break;

      case 'timeupdate':
        this.state.currentTime = Math.max(0, Number(message.currentTime) || 0);
        if (Number(message.duration) > 0) {
          this.state.duration = Number(message.duration);
        }
        this.state.isLoading = false;
        this.notify();
        break;

      case 'ended':
        this.state.isPlaying = false;
        this.state.currentTime = 0;
        this.state.activeId = null;
        this.notify();
        break;

      case 'error':
        console.warn('Audio playback error:', message.message);
        this.state.isPlaying = false;
        this.state.isLoading = false;
        this.state.activeId = null;
        this.notify();
        break;
    }
  }
}

export const chatAudioPlayerService = new ChatAudioPlayerManager();
