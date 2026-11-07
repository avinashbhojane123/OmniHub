import { AudioPlayerState, createDefaultAudioPlayerState } from '../../types/chat';

export type { AudioPlayerState };

export const AUDIO_BRIDGE_HTML = `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:transparent;">
  <audio id="audioEl" preload="auto" playsinline></audio>
  <script>
    const audio = document.getElementById('audioEl');
    audio.addEventListener('loadedmetadata', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loaded', duration: audio.duration || 0 }));
      }
    });
    audio.addEventListener('timeupdate', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'timeupdate', currentTime: audio.currentTime || 0, duration: audio.duration || 0 }));
      }
    });
    audio.addEventListener('ended', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' }));
      }
    });
    audio.addEventListener('error', function(e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'Audio playback failed' }));
      }
    });
    function handleCommand(rawData) {
      try {
        const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (data.command === 'play') {
          audio.src = data.url;
          audio.currentTime = 0;
          if (data.rate) audio.playbackRate = Number(data.rate) || 1;
          audio.play().catch(function(err) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: err.message }));
            }
          });
        } else if (data.command === 'rate') {
          audio.playbackRate = Number(data.rate) || 1;
        } else if (data.command === 'pause') {
          audio.pause();
        } else if (data.command === 'resume') {
          audio.play().catch(function() {});
        } else if (data.command === 'stop') {
          audio.pause();
          audio.currentTime = 0;
          audio.src = '';
        }
      } catch (err) {}
    }
    window.addEventListener('message', function(event) { handleCommand(event.data); });
    document.addEventListener('message', function(event) { handleCommand(event.data); });
  </script>
</body>
</html>
`;


type AudioPlayerListener = (state: AudioPlayerState) => void;

class ChatAudioPlayerManager {
  private state: AudioPlayerState = createDefaultAudioPlayerState();

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
