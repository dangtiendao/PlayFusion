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
});
