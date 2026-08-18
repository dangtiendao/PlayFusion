// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CaroGameView } from './View';
import { caroManifest } from '@engines/caro/manifest';
import { caroEngine, DEFAULT_CARO_OPTIONS } from '@engines/caro';
import type { GameShellApi } from '../types';
import type { CaroMatchConfig } from './types';
import * as useCaroAiModule from './useCaroAi';
import * as gameLocalDataModule from '../../core/gameLocalData';

/**
 * Mock hook useCaroAi để kiểm soát hành vi bất đồng bộ và kiểm tra 4 ca vòng đời
 */
vi.mock('./useCaroAi', () => ({
  useCaroAi: vi.fn(),
}));

/**
 * Helper phát sự kiện PointerEvent kèm tọa độ clientX/clientY chính xác trong môi trường jsdom
 */
function firePointerEvent(
  element: HTMLElement,
  type: 'pointerdown' | 'pointerup',
  coords: { clientX: number; clientY: number } = { clientX: 100, clientY: 100 },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: coords.clientX, writable: false });
  Object.defineProperty(event, 'clientY', { value: coords.clientY, writable: false });
  fireEvent(element, event);
}

/**
 * Helper thực hiện nước đi bằng Shortcut 2 Chạm
 */
function playMove2Tap(cell: HTMLElement) {
  // Chạm 1: Đặt preview
  act(() => {
    firePointerEvent(cell, 'pointerdown', { clientX: 50, clientY: 50 });
    firePointerEvent(cell, 'pointerup', { clientX: 50, clientY: 50 });
  });
  // Chạm 2: Xác nhận đánh
  act(() => {
    firePointerEvent(cell, 'pointerdown', { clientX: 50, clientY: 50 });
    firePointerEvent(cell, 'pointerup', { clientX: 50, clientY: 50 });
  });
}

describe('Caro Game View Component, Local Data & Auto-Save Recovery Tests (View.tsx - P1.5a & P1.5b)', () => {
  let mockShellApi: GameShellApi;
  let mockOnGameEnd: ReturnType<typeof vi.fn>;
  let mockRequestMove: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockShellApi = {
      playSfx: vi.fn(),
      hapticTap: vi.fn(),
      hapticSuccess: vi.fn(),
      hapticError: vi.fn(),
    };
    mockOnGameEnd = vi.fn();
    mockRequestMove = vi.fn();
    mockCancel = vi.fn();

    // Default mock implementation
    vi.mocked(useCaroAiModule.useCaroAi).mockReturnValue({
      requestMove: mockRequestMove,
      isThinking: false,
      cancel: mockCancel,
    });

    vi.spyOn(gameLocalDataModule, 'recordResult');
    vi.spyOn(gameLocalDataModule, 'setLastConfig');
    vi.spyOn(gameLocalDataModule, 'saveMatch');
    vi.spyOn(gameLocalDataModule, 'clearSavedMatch');
    vi.spyOn(gameLocalDataModule, 'appendHistory');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1. Khởi đầu tại màn hình SETUP: Hiển thị ModeSelect với các tùy chọn từ caroManifest', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    expect(screen.getByTestId('caro-mode-select')).not.toBeNull();
    expect(screen.queryByTestId('interactive-caro-board')).toBeNull();
  });

  it('2. Luồng Auto-save (P1.5b): Đánh 3 nước -> saveMatch được gọi đúng 3 lần kèm state serialize mới nhất', async () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Bắt đầu chế độ 2 người 1 máy
    const pvpBtn = screen.getByTestId('mode-btn-local_pvp');
    act(() => {
      fireEvent.click(pvpBtn);
    });

    // Nước 1: Ô 0
    playMove2Tap(screen.getByTestId('caro-cell-0'));
    expect(gameLocalDataModule.saveMatch).toHaveBeenCalledTimes(1);
    expect(gameLocalDataModule.saveMatch).toHaveBeenLastCalledWith(
      'caro',
      expect.objectContaining({
        schemaVersion: 1,
        gameConfig: { mode: 'local_pvp' },
      }),
    );

    // Nước 2: Ô 15
    playMove2Tap(screen.getByTestId('caro-cell-15'));
    expect(gameLocalDataModule.saveMatch).toHaveBeenCalledTimes(2);

    // Nước 3: Ô 1
    playMove2Tap(screen.getByTestId('caro-cell-1'));
    expect(gameLocalDataModule.saveMatch).toHaveBeenCalledTimes(3);
  });

  it('3. Khi ván đấu kết thúc -> clearSavedMatch và appendHistory được gọi để lưu lịch sử (P1.5c)', async () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    const pvpBtn = screen.getByTestId('mode-btn-local_pvp');
    act(() => {
      fireEvent.click(pvpBtn);
    });

    // Chuỗi thắng 5 quân cho X
    const moves = [0, 15, 1, 16, 2, 17, 3, 18, 4];
    for (const cellIdx of moves) {
      playMove2Tap(screen.getByTestId(`caro-cell-${cellIdx}`));
    }

    // Xác nhận clearSavedMatch được gọi khi ván kết thúc
    expect(gameLocalDataModule.clearSavedMatch).toHaveBeenCalledWith('caro');

    // Xác nhận appendHistory được gọi đúng format nén chuỗi moves
    expect(gameLocalDataModule.appendHistory).toHaveBeenCalledWith(
      'caro',
      expect.objectContaining({
        modeKey: 'local_pvp',
        outcome: 'none',
        summary: expect.objectContaining({
          moveCount: 9,
          winnerSeat: 0,
        }),
        movesSerialized: '0,15,1,16,2,17,3,18,4',
      }),
    );
  });

  it('4. Pipeline khôi phục ván dở (a-e): Bấm Tiếp tục -> Bàn cờ tải đúng thế cờ và số nước', async () => {
    // Giả lập trạng thái đã chơi 2 nước (X đánh ô 0, O đánh ô 15)
    const baseState = caroEngine.init({
      playerCount: 2,
      options: DEFAULT_CARO_OPTIONS,
    });
    const s1 = caroEngine.applyMove(baseState, 0, 0);
    const s2 = caroEngine.applyMove(s1, 15, 1);
    const serialized = caroEngine.serialize(s2);

    vi.spyOn(gameLocalDataModule, 'getSavedMatch').mockReturnValue({
      schemaVersion: 1,
      engineStateSerialized: serialized,
      gameConfig: { mode: 'local_pvp' } as CaroMatchConfig,
      sessionExtra: { sessionScore: { player1Wins: 1, player2Wins: 0, draws: 0, matchNumber: 2 } },
      savedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    });

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Màn setup hiển thị khối "Tiếp tục ván dở"
    expect(screen.getByTestId('saved-match-card')).not.toBeNull();
    expect(screen.getByText(/3 phút trước/i)).not.toBeNull();

    // Bấm nút "Tiếp tục chơi"
    act(() => {
      fireEvent.click(screen.getByTestId('resume-saved-match-btn'));
    });

    // Chuyển sang màn hình PLAYING với bàn cờ khôi phục chính xác
    expect(screen.queryByTestId('caro-mode-select')).toBeNull();
    expect(screen.getByTestId('turn-indicator')).not.toBeNull();
    expect(screen.getByText('Ván 2')).not.toBeNull();
    expect(screen.getByText('1 - 0')).not.toBeNull();
    expect(screen.getByText('Nước đi')).not.toBeNull();
    expect(screen.getByText('3')).not.toBeNull(); // Nước kế tiếp là 3

    // Ô 0 có quân X, ô 15 có quân O
    expect(screen.getByTestId('caro-cell-0').getAttribute('data-value')).toBe('0');
    expect(screen.getByTestId('caro-cell-15').getAttribute('data-value')).toBe('1');
  });

  it('5. Khôi phục ván dở đến lượt máy (vs_ai): Worker AI tự động được kích hoạt sau khi khôi phục', async () => {
    // Khôi phục ván đấu vs_ai cấp độ Hard, người đi X đánh ô 0 -> đến lượt máy O
    const baseState = caroEngine.init({
      playerCount: 2,
      options: DEFAULT_CARO_OPTIONS,
    });
    const s1 = caroEngine.applyMove(baseState, 0, 0); // currentPlayer = 1 (Máy)
    const serialized = caroEngine.serialize(s1);

    vi.spyOn(gameLocalDataModule, 'getSavedMatch').mockReturnValue({
      schemaVersion: 1,
      engineStateSerialized: serialized,
      gameConfig: { mode: 'vs_ai', aiLevel: 'hard', humanSeat: 0 } as CaroMatchConfig,
      savedAt: new Date().toISOString(),
    });

    mockRequestMove.mockResolvedValue(112);

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Bấm Tiếp tục
    await act(async () => {
      fireEvent.click(screen.getByTestId('resume-saved-match-btn'));
    });

    // AI hook requestMove tự động được gọi
    expect(mockRequestMove).toHaveBeenCalledTimes(1);

    // Tiến thời gian và hoàn thành nước AI
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const cell112 = screen.getByTestId('caro-cell-112');
    expect(cell112.getAttribute('data-value')).toBe('1');
  });

  it('6. Pipeline khôi phục (f) - Dữ liệu ván lưu bị hỏng: Xóa saveMatch, hiện Toast thông báo và ở lại Setup', async () => {
    vi.spyOn(gameLocalDataModule, 'getSavedMatch').mockReturnValue({
      schemaVersion: 1,
      engineStateSerialized: '{"corrupted_invalid_data": true}',
      gameConfig: { mode: 'local_pvp' },
      savedAt: new Date().toISOString(),
    });

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Bấm Tiếp tục
    act(() => {
      fireEvent.click(screen.getByTestId('resume-saved-match-btn'));
    });

    // Xác nhận đã dọn dẹp saveMatch
    expect(gameLocalDataModule.clearSavedMatch).toHaveBeenCalledWith('caro');

    // Ở lại Setup và hiển thị Toast thông báo lỗi
    expect(screen.getByTestId('caro-mode-select')).not.toBeNull();
    expect(screen.getByTestId('recovery-toast')).not.toBeNull();
    expect(screen.getByText(/Ván lưu bị lỗi/i)).not.toBeNull();
  });

  it('7. Bấm "Bỏ ván này" -> clearSavedMatch được gọi và khối Tiếp tục biến mất', () => {
    vi.spyOn(gameLocalDataModule, 'getSavedMatch').mockReturnValue({
      schemaVersion: 1,
      engineStateSerialized: '{"b":[]}',
      gameConfig: { mode: 'local_pvp' },
      savedAt: new Date().toISOString(),
    });

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    expect(screen.getByTestId('saved-match-card')).not.toBeNull();

    // Bấm Bỏ ván này
    act(() => {
      fireEvent.click(screen.getByTestId('discard-saved-match-btn'));
    });

    expect(gameLocalDataModule.clearSavedMatch).toHaveBeenCalledWith('caro');
    expect(screen.queryByTestId('saved-match-card')).toBeNull();
  });
});
