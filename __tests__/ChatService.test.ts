import { chatSocketService } from '../src/services/chat/ChatSocketService';

describe('ChatSocketService', () => {
  afterEach(() => {
    chatSocketService.disconnect();
  });

  it('initializes with default disconnected state and empty feeds', () => {
    expect(chatSocketService.isConnected).toBe(false);
    expect(chatSocketService.connectionState).toBe('disconnected');
    expect(chatSocketService.getMessages).toEqual([]);
    expect(chatSocketService.getUsers).toEqual([]);
    expect(chatSocketService.getStatuses).toEqual([]);
    expect(chatSocketService.getTypingUsers).toEqual([]);
    expect(chatSocketService.getPinnedMessage).toBeNull();
    expect(chatSocketService.getActiveCall).toBeNull();
    expect(chatSocketService.getWatchParty).toBeNull();
  });

  it('allows subscription and notification of listeners', () => {
    const listener = jest.fn();
    const unsubscribe = chatSocketService.subscribe(listener);

    // Call disconnect or method that notifies
    chatSocketService.disconnect();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    chatSocketService.disconnect();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stores nickname and passcode on connect attempt', () => {
    chatSocketService.connect({
      nickname: 'Alex',
      passcode: 'SecretRoom',
      serverUrl: 'https://backend-9i6w.onrender.com',
    });

    expect(chatSocketService.nickname).toBe('Alex');
    expect(chatSocketService.passcode).toBe('SecretRoom');
    expect(chatSocketService.activeServerUrl).toBe('https://backend-9i6w.onrender.com');
  });
});
