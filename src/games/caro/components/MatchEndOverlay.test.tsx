// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MatchEndOverlay, type SessionScore } from './MatchEndOverlay';
import type { MatchResultReport } from '@engines/types';
import type { GameShellApi } from '../../types';
import type { GameLocalStats } from '../../../core/gameLocalData';

describe('MatchEndOverlay Component Tests (MatchEndOverlay.tsx - P1.5a)', () => {
  let mockShellApi: GameShellApi;
  let mockOnRestart: ReturnType<typeof vi.fn>;
  let mockOnBackToSetup: ReturnType<typeof vi.fn>;
  let mockOnExit: ReturnType<typeof vi.fn>;

  const defaultSessionScore: SessionScore = {
    player1Wins: 2,
    player2Wins: 1,
    draws: 0,
    matchNumber: 3,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockShellApi = {
      playSfx: vi.fn(),
      hapticTap: vi.fn(),
      hapticSuccess: vi.fn(),
      hapticError: vi.fn(),
    };
    mockOnRestart = vi.fn();
    mockOnBackToSetup = vi.fn();
    mockOnExit = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Hiển thị sau 800ms delay với kết quả Người Thắng (vs_ai) + Confetti + Sfx success', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'vs_ai',
      durationMs: 45000,
      participants: [
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'vs_ai', aiLevel: 'hard', humanSeat: 0 }}
        moveCount={15}
        sessionScore={defaultSessionScore}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    // Trước 800ms: Chưa hiển thị
    expect(screen.queryByTestId('match-end-overlay')).toBeNull();

    // Sau 800ms
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('match-end-overlay')).not.toBeNull();
    expect(screen.getByText('BẠN THẮNG! 🎉')).not.toBeNull();
    expect(screen.getByText('Máy Khó')).not.toBeNull();
    expect(screen.getByText('15 nước')).not.toBeNull();
    expect(screen.getByText('⏱️ 00:45')).not.toBeNull();
    expect(screen.getByTestId('confetti-container')).not.toBeNull();

    // Sfx success và haptic được gọi đúng 1 lần
    expect(mockShellApi.playSfx).toHaveBeenCalledWith('success');
    expect(mockShellApi.hapticSuccess).toHaveBeenCalled();
  });

  it('2. Hiển thị Người Thua (vs_ai) + Sfx error + Không có confetti', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'vs_ai',
      durationMs: 72000,
      participants: [
        { playerIndex: 1, outcome: 'win' }, // Máy (seat 1) thắng
        { playerIndex: 0, outcome: 'loss' }, // Người (seat 0) thua
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'vs_ai', aiLevel: 'medium', humanSeat: 0 }}
        moveCount={24}
        sessionScore={defaultSessionScore}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText('BẠN THUA!')).not.toBeNull();
    expect(screen.queryByTestId('confetti-container')).toBeNull();
    expect(mockShellApi.playSfx).toHaveBeenCalledWith('error');
    expect(mockShellApi.hapticError).toHaveBeenCalled();
  });

  it('3. Hiển thị Hòa cờ (vs_ai) + Sfx click', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'vs_ai',
      durationMs: 120000,
      participants: [
        { playerIndex: 0, outcome: 'draw' },
        { playerIndex: 1, outcome: 'draw' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'vs_ai', aiLevel: 'easy', humanSeat: 0 }}
        moveCount={225}
        sessionScore={{ ...defaultSessionScore, draws: 1 }}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText('VÁN ĐẤU HÒA!')).not.toBeNull();
    expect(mockShellApi.playSfx).toHaveBeenCalledWith('click');
  });

  it('4. Hiển thị chế độ 2 người 1 máy (local_pvp): Quân O thắng', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'local_pvp',
      durationMs: 30000,
      participants: [
        { playerIndex: 1, outcome: 'win' },
        { playerIndex: 0, outcome: 'loss' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'local_pvp' }}
        moveCount={18}
        sessionScore={{ player1Wins: 1, player2Wins: 2, draws: 0, matchNumber: 3 }}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText('QUÂN O THẮNG! 🎉')).not.toBeNull();
    expect(screen.getByTestId('session-score-card')).not.toBeNull();
  });

  it('5. Tương tác 3 nút bấm: Chơi lại, Đổi chế độ, Thoát', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'local_pvp',
      durationMs: 30000,
      participants: [
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'local_pvp' }}
        moveCount={15}
        sessionScore={defaultSessionScore}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    // 1. Bấm Chơi lại
    act(() => {
      fireEvent.click(screen.getByTestId('overlay-restart-btn'));
    });
    expect(mockOnRestart).toHaveBeenCalledTimes(1);

    // 2. Bấm Đổi chế độ
    act(() => {
      fireEvent.click(screen.getByTestId('overlay-setup-btn'));
    });
    expect(mockOnBackToSetup).toHaveBeenCalledTimes(1);

    // 3. Bấm Thoát
    act(() => {
      fireEvent.click(screen.getByTestId('overlay-exit-btn'));
    });
    expect(mockOnExit).toHaveBeenCalledTimes(1);
  });

  it('6. Hiển thị bảng tổng tích lũy thành tích dài hạn (accumulatedStats)', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'vs_ai',
      durationMs: 30000,
      participants: [
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ],
    };

    const mockAccumulatedStats: GameLocalStats = {
      totalMatches: 10,
      wins: 7,
      losses: 2,
      draws: 1,
      byMode: {
        'vs_ai:hard': { matches: 8, wins: 6, losses: 1, draws: 1 },
      },
      currentStreak: 4,
      bestStreak: 5,
      updatedAt: new Date().toISOString(),
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'vs_ai', aiLevel: 'hard', humanSeat: 0 }}
        moveCount={15}
        sessionScore={defaultSessionScore}
        accumulatedStats={mockAccumulatedStats}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('accumulated-stats-card')).not.toBeNull();
    expect(screen.getByText(/6/)).not.toBeNull();
    expect(screen.getByText(/Chuỗi 4/)).not.toBeNull();
  });

  it('7. [P4.3c Rank Settled] Hiển thị khối rank khi có settledData: delta +16, +50 xu, counter rating', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'online_1v1',
      durationMs: 45000,
      participants: [
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'online_1v1', humanSeat: 0 }}
        moveCount={20}
        settledData={{
          ratingDelta: 16,
          newRating: 1216,
          oldRating: 1200,
          coins: 50,
          tierBefore: { id: 'gold', name: 'Vàng', minRating: 1200, maxRating: 1399 },
          tierAfter: { id: 'gold', name: 'Vàng', minRating: 1200, maxRating: 1399 },
          rankChange: 'same',
        }}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('rank-settled-card')).not.toBeNull();
    expect(screen.getByTestId('rating-delta-text').textContent).toContain('+16 điểm');
    expect(screen.getByTestId('coins-reward-text').textContent).toContain('+50 xu');
    expect(screen.getByTestId('animated-rating-text')).not.toBeNull();
    expect(screen.queryByTestId('rank-up-banner')).toBeNull();
  });

  it('8. [P4.3c THĂNG HẠNG] rankChange: up -> Hiển thị banner THĂNG HẠNG, confetti và badge bậc mới', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'online_1v1',
      durationMs: 60000,
      participants: [
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'online_1v1', humanSeat: 0 }}
        moveCount={25}
        settledData={{
          ratingDelta: 16,
          newRating: 1211,
          oldRating: 1195,
          coins: 50,
          tierBefore: { id: 'silver', name: 'Bạc', minRating: 1000, maxRating: 1199 },
          tierAfter: { id: 'gold', name: 'Vàng', minRating: 1200, maxRating: 1399 },
          rankChange: 'up',
        }}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('rank-up-banner')).not.toBeNull();
    expect(screen.getByText('🌟 THĂNG HẠNG! 🌟')).not.toBeNull();
    expect(screen.getByTestId('confetti-container')).not.toBeNull();
    expect(mockShellApi.playSfx).toHaveBeenCalledWith('success');
  });

  it('9. [P4.3c KHIÊN BẢO VỆ] rankChange: down + isShielded: true -> Hiển thị thông điệp khiên bảo vệ', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'online_1v1',
      durationMs: 40000,
      participants: [
        { playerIndex: 0, outcome: 'loss' },
        { playerIndex: 1, outcome: 'win' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'online_1v1', humanSeat: 0 }}
        moveCount={19}
        settledData={{
          ratingDelta: -16,
          newRating: 1189,
          oldRating: 1205,
          coins: 5,
          tierBefore: { id: 'gold', name: 'Vàng', minRating: 1200, maxRating: 1399 },
          tierAfter: { id: 'silver', name: 'Bạc', minRating: 1000, maxRating: 1199 },
          rankChange: 'down',
          isShielded: true,
        }}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('demotion-shield-message')).not.toBeNull();
    expect(screen.getByText(/Được bảo vệ rớt hạng — thắng trận sau để giữ Vàng!/)).not.toBeNull();
    expect(screen.queryByTestId('demotion-message')).toBeNull();
  });

  it('10. [P4.3c RỚT HẠNG THẬT] rankChange: down + isShielded: false -> Hiển thị dòng xuống hạng nhẹ nhàng', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'online_1v1',
      durationMs: 40000,
      participants: [
        { playerIndex: 0, outcome: 'loss' },
        { playerIndex: 1, outcome: 'win' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'online_1v1', humanSeat: 0 }}
        moveCount={21}
        settledData={{
          ratingDelta: -16,
          newRating: 1173,
          oldRating: 1189,
          coins: 5,
          tierBefore: { id: 'silver', name: 'Bạc', minRating: 1000, maxRating: 1199 },
          tierAfter: { id: 'silver', name: 'Bạc', minRating: 1000, maxRating: 1199 },
          rankChange: 'down',
          isShielded: false,
        }}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('demotion-message')).not.toBeNull();
    expect(screen.getByText(/Xuống hạng Bạc — cố lên!/)).not.toBeNull();
    expect(screen.queryByTestId('demotion-shield-message')).toBeNull();
  });

  it('11. [P4.3c Unranked / Abort] Ván unranked (settledData = null) hoặc abort -> KHÔNG có khối rank', () => {
    const mockReport: MatchResultReport = {
      gameId: 'caro',
      mode: 'online_1v1',
      durationMs: 10000,
      participants: [
        { playerIndex: 0, outcome: 'draw' },
        { playerIndex: 1, outcome: 'draw' },
      ],
    };

    render(
      <MatchEndOverlay
        report={mockReport}
        matchConfig={{ mode: 'online_1v1', humanSeat: 0 }}
        moveCount={2}
        endReason="abort"
        settledData={null}
        onRestart={mockOnRestart}
        onBackToSetup={mockOnBackToSetup}
        onExit={mockOnExit}
        shellApi={mockShellApi}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.queryByTestId('rank-settled-card')).toBeNull();
  });
});
