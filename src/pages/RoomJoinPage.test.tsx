/**
 * ==============================================================================
 * UNIT TESTS: ROOM JOIN DEEP LINK PAGE (SRC/PAGES/ROOMJOINPAGE.TEST.TSX)
 * ==============================================================================
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoomJoinPage } from './RoomJoinPage';
import { roomRepository } from '@/repositories/roomRepository';
import { useAuthStore } from '@/stores/authStore';

import type { AppAuthUser } from '@/repositories/authRepository';

vi.mock('@/repositories/roomRepository', () => ({
  roomRepository: {
    getRoomInfo: vi.fn(),
    joinRoom: vi.fn(),
    notifyRoomMatched: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('RoomJoinPage Deep Link Tests (P3.3b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 'user-123',
        email: 'test@playfusion.com',
        isAnonymous: false,
      } as unknown as AppAuthUser,
      isInitialized: true,
    });
  });

  it('1. Đọc mã từ URL -> render thông tin phòng hợp lệ và nút Tham gia', async () => {
    vi.mocked(roomRepository.getRoomInfo).mockResolvedValueOnce({
      code: 'ABC234',
      hostId: 'host-1',
      gameId: 'caro',
      status: 'waiting',
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    });

    render(
      <MemoryRouter initialEntries={['/room/ABC234']}>
        <Routes>
          <Route path="/room/:code" element={<RoomJoinPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('room-code-badge').textContent).toBe('ABC234');
      expect(screen.getByTestId('confirm-join-btn')).toBeDefined();
    });
  });

  it('2. Bấm Tham gia trận đấu -> gọi joinRoom và điều hướng tới /game/caro/online/:matchId', async () => {
    vi.mocked(roomRepository.getRoomInfo).mockResolvedValueOnce({
      code: 'ABC234',
      hostId: 'host-1',
      gameId: 'caro',
      status: 'waiting',
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    });

    vi.mocked(roomRepository.joinRoom).mockResolvedValueOnce({
      matchId: 'match-xyz',
      mySeat: 1,
      gameId: 'caro',
    });

    render(
      <MemoryRouter initialEntries={['/room/ABC234']}>
        <Routes>
          <Route path="/room/:code" element={<RoomJoinPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('confirm-join-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('confirm-join-btn'));

    await waitFor(() => {
      expect(roomRepository.joinRoom).toHaveBeenCalledWith('ABC234');
      expect(roomRepository.notifyRoomMatched).toHaveBeenCalledWith('ABC234', 'match-xyz', 0);
      expect(mockNavigate).toHaveBeenCalledWith('/game/caro/online/match-xyz', {
        state: {
          mySeat: 1,
          roomCode: 'ABC234',
          gameId: 'caro',
        },
      });
    });
  });

  it('3. Phòng không tồn tại -> hiển thị thông báo lỗi', async () => {
    vi.mocked(roomRepository.getRoomInfo).mockResolvedValueOnce(null);

    render(
      <MemoryRouter initialEntries={['/room/ABC999']}>
        <Routes>
          <Route path="/room/:code" element={<RoomJoinPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('room-join-error')).toBeDefined();
      expect(screen.getByTestId('back-home-btn')).toBeDefined();
    });
  });
});
