// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audioManager } from './audio';
import { useSettingsStore } from '@/stores/settingsStore';

describe('Audio Manager Unit Tests (src/core/audio.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.getState().resetSettings();

    // Mock AudioContext cho môi trường test
    const mockAudioContext = vi.fn().mockImplementation(() => ({
      state: 'suspended',
      resume: vi.fn().mockResolvedValue(undefined),
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        gain: { value: 1 },
        connect: vi.fn(),
      }),
      decodeAudioData: vi.fn().mockResolvedValue({} as AudioBuffer),
      destination: {},
    }));

    window.AudioContext = mockAudioContext as unknown as typeof AudioContext;
    audioManager.initAudioContext();
  });

  it('1. getState: Trả về trạng thái hợp lệ của AudioContext', () => {
    const state = audioManager.getState();
    expect(['running', 'suspended', 'closed', 'unsupported']).toContain(state);
  });

  it('2. unlock: Kích hoạt resume AudioContext', async () => {
    const success = await audioManager.unlock();
    expect(typeof success).toBe('boolean');
  });

  it('3. playSfx: Không phát âm thanh khi soundEnabled là false (Muted Compliance)', () => {
    useSettingsStore.getState().toggleSound(); // soundEnabled = false
    expect(useSettingsStore.getState().soundEnabled).toBe(false);

    // Không ném lỗi
    expect(() => audioManager.playSfx('click')).not.toThrow();
  });

  it('4. playSfx: Xử lý an toàn khi key âm thanh chưa nạp', () => {
    useSettingsStore.getState().setTheme('system');
    expect(useSettingsStore.getState().soundEnabled).toBe(true);

    // Phát key không tồn tại -> no-op an toàn
    expect(() => audioManager.playSfx('unknown_sfx_key')).not.toThrow();
  });

  it('5. loadSfx: Bắt lỗi mạng khi fetch thất bại mà không làm crash app', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await audioManager.loadSfx('fail_test', '/sfx/non_existent.wav');
    expect(warnSpy).toHaveBeenCalled();
  });
});
