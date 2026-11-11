import { NativeModules, Platform } from 'react-native';

const { TeraBoxPlayerModule } = NativeModules;

export interface ITeraBoxNativePlayer {
  isPiPSupported(): Promise<boolean>;
  enterPiP(aspectRatioWidth?: number, aspectRatioHeight?: number): Promise<boolean>;
  setOrientation(orientation: 'landscape' | 'portrait' | 'sensor' | 'user'): void;
  setKeepScreenOn(enabled: boolean): void;
}

class TeraBoxNativePlayerBridge implements ITeraBoxNativePlayer {
  async isPiPSupported(): Promise<boolean> {
    if (Platform.OS !== 'android' || !TeraBoxPlayerModule?.isPiPSupported) {
      return false;
    }
    try {
      return await TeraBoxPlayerModule.isPiPSupported();
    } catch {
      return false;
    }
  }

  async enterPiP(aspectRatioWidth = 16, aspectRatioHeight = 9): Promise<boolean> {
    if (Platform.OS !== 'android' || !TeraBoxPlayerModule?.enterPiP) {
      return false;
    }
    try {
      return await TeraBoxPlayerModule.enterPiP(aspectRatioWidth, aspectRatioHeight);
    } catch {
      return false;
    }
  }

  setOrientation(orientation: 'landscape' | 'portrait' | 'sensor' | 'user'): void {
    if (Platform.OS === 'android' && TeraBoxPlayerModule?.setOrientation) {
      try {
        TeraBoxPlayerModule.setOrientation(orientation);
      } catch (e) {
        console.warn('[TeraBoxNativePlayer] setOrientation failed:', e);
      }
    }
  }

  setKeepScreenOn(enabled: boolean): void {
    if (Platform.OS === 'android' && TeraBoxPlayerModule?.setKeepScreenOn) {
      try {
        TeraBoxPlayerModule.setKeepScreenOn(enabled);
      } catch (e) {
        console.warn('[TeraBoxNativePlayer] setKeepScreenOn failed:', e);
      }
    }
  }
}

export const nativePlayerBridge = new TeraBoxNativePlayerBridge();

