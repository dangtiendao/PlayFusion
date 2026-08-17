import { useSettingsStore } from '@/stores/settingsStore';

/**
 * ==============================================================================
 * MODULE QUẢN LÝ HIỆU ỨNG ÂM THANH (AUDIO MANAGER)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & QUY TẮC BẤT BIẾN:
 * 1. WEB AUDIO API VS THẺ <AUDIO>:
 *    - Sử dụng `AudioContext` và `AudioBufferSourceNode` thay vì thẻ `<audio>`.
 *    - Lý do: Web Audio API có độ trễ cực thấp (<10ms), hỗ trợ phát đồng thời nhiều âm thanh
 *      trùng lặp (polyphonic) mà không bị nghẽn kênh hoặc lag giật khi di chuyển quân cờ liên tục.
 * 2. CHÍNH SÁCH AUTOPLAY CỦA TRÌNH DUYỆT (BROWSER AUTOPLAY POLICY):
 *    - Trình duyệt hiện đại (Chrome, Safari, Firefox) cấm `AudioContext` tự động phát âm thanh
 *      trước khi có tương tác đầu tiên của người dùng (User Gesture).
 *    - Cơ chế `unlock()`: Tự động đăng ký one-time listener trên sự kiện `pointerdown`/`keydown`
 *      toàn cục khi khởi tạo, gọi `audioContext.resume()` và tự hủy listener sau khi kích hoạt thành công.
 * 3. TÔN TRỌNG CÀI ĐẶT NGƯỜI DÙNG (MUTED COMPLIANCE):
 *    - Hàm `playSfx` luôn kiểm tra `useSettingsStore.getState().soundEnabled` TẠI THỜI ĐIỂM PHÁT.
 *      Nếu người dùng tắt âm thanh trong Cài đặt, module sẽ im lặng tuyệt đối.
 * ==============================================================================
 */

export interface PlaySfxOptions {
  /** Âm lượng phát (từ 0.0 đến 1.0, mặc định 1.0) */
  readonly volume?: number;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private isUnlocked = false;
  private unlockListenerAttached = false;

  constructor() {
    this.initAudioContext();
    this.setupAutoplayUnlock();
  }

  /**
   * Khởi tạo đối tượng AudioContext an toàn theo chuẩn W3C (hỗ trợ cả webkitAudioContext cũ).
   */
  public initAudioContext(): void {
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (AudioCtx) {
        this.ctx = new AudioCtx();
        if (this.ctx.state === 'running') {
          this.isUnlocked = true;
        }
      }
    } catch (err) {
      console.warn('[Audio] Trình duyệt không hỗ trợ Web Audio API:', err);
    }
  }

  /**
   * Thiết lập one-time listener để mở khóa AudioContext sau cử chỉ chạm/bấm đầu tiên của người dùng.
   */
  private setupAutoplayUnlock(): void {
    if (typeof window === 'undefined' || this.isUnlocked || this.unlockListenerAttached) return;

    const handleFirstGesture = async () => {
      await this.unlock();
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      this.unlockListenerAttached = false;
    };

    window.addEventListener('pointerdown', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true, once: true });
    this.unlockListenerAttached = true;
  }

  /**
   * Mở khóa AudioContext bị suspended bởi Autoplay Policy.
   */
  public async unlock(): Promise<boolean> {
    if (!this.ctx) {
      this.initAudioContext();
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this.isUnlocked = true;
        return true;
      } catch (err) {
        console.warn('[Audio] Không thể resume AudioContext:', err);
        return false;
      }
    }

    if (this.ctx && this.ctx.state === 'running') {
      this.isUnlocked = true;
      return true;
    }

    return false;
  }

  /**
   * Lấy trạng thái hiện tại của AudioContext.
   */
  public getState(): AudioContextState | 'unsupported' {
    if (!this.ctx) return 'unsupported';
    return this.ctx.state;
  }

  /**
   * Tải và giải mã một file âm thanh vào bộ đệm bộ nhớ (AudioBuffer).
   *
   * @param key Tên định danh âm thanh (ví dụ: 'click', 'success', 'error').
   * @param url Đường dẫn tới file âm thanh (ví dụ: '/sfx/click.wav').
   */
  public async loadSfx(key: string, url: string): Promise<void> {
    if (!this.ctx) {
      this.initAudioContext();
    }
    if (!this.ctx) {
      console.warn(
        `[Audio] Không thể nạp hiệu ứng âm thanh "${key}": AudioContext không khả dụng.`,
      );
      return;
    }
    if (this.buffers.has(key)) return; // Đã cache trước đó

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} khi tải âm thanh từ ${url}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(key, audioBuffer);
    } catch (err) {
      console.warn(`[Audio] Không thể nạp hiệu ứng âm thanh "${key}" từ ${url}:`, err);
    }
  }

  /**
   * Phát một hiệu ứng âm thanh đã nạp.
   *
   * @param key Tên định danh âm thanh ('click' | 'success' | 'error' | tên tùy chỉnh).
   * @param options Tùy chọn âm lượng (volume 0..1).
   */
  public playSfx(key: string, options?: PlaySfxOptions): void {
    // 1. Kiểm tra cờ bật/tắt âm thanh từ Store
    const soundEnabled = useSettingsStore.getState().soundEnabled;
    if (!soundEnabled) return;

    if (!this.ctx) return;

    // 2. Tự động thử unlock nếu đang suspended
    if (this.ctx.state === 'suspended') {
      void this.unlock();
      return;
    }

    // 3. Lấy buffer từ cache
    const buffer = this.buffers.get(key);
    if (!buffer) {
      // Nếu chưa có buffer, tự động tải ngầm cho lần phát sau nếu là SFX mặc định
      if (['click', 'success', 'error'].includes(key)) {
        void this.loadSfx(key, `/sfx/${key}.wav`);
      }
      return;
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.ctx.createGain();
      const volume = Math.max(0, Math.min(1, options?.volume ?? 1.0));
      gainNode.gain.value = volume;

      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      source.start(0);
    } catch (err) {
      console.warn(`[Audio] Lỗi khi phát âm thanh "${key}":`, err);
    }
  }

  /**
   * Tải trước danh sách các hiệu ứng âm thanh mặc định của hệ thống.
   */
  public preloadDefaultSfx(): void {
    void this.loadSfx('click', '/sfx/click.wav');
    void this.loadSfx('success', '/sfx/success.wav');
    void this.loadSfx('error', '/sfx/error.wav');
  }
}

/** Singleton instance quản lý âm thanh toàn ứng dụng */
export const audioManager = new AudioManager();

// Tự động tải trước các file SFX cơ bản khi module được nạp
if (typeof window !== 'undefined') {
  audioManager.preloadDefaultSfx();
}

export default audioManager;
