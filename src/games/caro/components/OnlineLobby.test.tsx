/**
 * ==============================================================================
 * UNIT TESTS: ONLINE LOBBY COMPONENT (SRC/GAMES/CARO/COMPONENTS/ONLINELOBBY.TEST.TSX)
 * ==============================================================================
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnlineLobby } from './OnlineLobby';
import { roomRepository } from '@/repositories/roomRepository';

vi.mock('@/repositories/roomRepository', () => ({
  roomRepository: {
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
  },
}));

describe('OnlineLobby Component Tests (P3.3b)', () => {
  const onBackMock = vi.fn();
  const onRoomCreatedMock = vi.fn();
  const onRoomJoinedMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Render đầy đủ các nút Tạo phòng và ô Nhập mã', () => {
    render(
      <OnlineLobby
        onBack={onBackMock}
        onRoomCreated={onRoomCreatedMock}
        onRoomJoined={onRoomJoinedMock}
      />,
    );

    expect(screen.getByTestId('create-room-btn')).toBeDefined();
    expect(screen.getByTestId('room-code-input')).toBeDefined();
    const joinBtn = screen.getByTestId('join-room-btn') as HTMLButtonElement;
    expect(joinBtn.disabled).toBe(true);
  });

  it('2. Bấm Tạo phòng -> gọi roomRepository.createRoom và gọi onRoomCreated', async () => {
    vi.mocked(roomRepository.createRoom).mockResolvedValueOnce({
      code: 'XYZ789',
      expiresAt: '2026-08-22T23:30:00Z',
    });

    render(
      <OnlineLobby
        onBack={onBackMock}
        onRoomCreated={onRoomCreatedMock}
        onRoomJoined={onRoomJoinedMock}
      />,
    );

    const createBtn = screen.getByTestId('create-room-btn');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(roomRepository.createRoom).toHaveBeenCalledWith('caro', 'online_1v1');
      expect(onRoomCreatedMock).toHaveBeenCalledWith('XYZ789', '2026-08-22T23:30:00Z');
    });
  });

  it('3. Nhập mã phòng: tự động viết hoa và mở khóa nút Vào phòng khi đủ 6 ký tự', () => {
    render(
      <OnlineLobby
        onBack={onBackMock}
        onRoomCreated={onRoomCreatedMock}
        onRoomJoined={onRoomJoinedMock}
      />,
    );

    const input = screen.getByTestId('room-code-input') as HTMLInputElement;
    const joinBtn = screen.getByTestId('join-room-btn') as HTMLButtonElement;

    // Nhập 3 ký tự thường
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('ABC');
    expect(joinBtn.disabled).toBe(true);

    // Nhập đủ 6 ký tự
    fireEvent.change(input, { target: { value: 'abc234' } });
    expect(input.value).toBe('ABC234');
    expect(joinBtn.disabled).toBe(false);
  });

  it('4. Vào phòng thành công -> gọi onRoomJoined với matchId và mySeat', async () => {
    vi.mocked(roomRepository.joinRoom).mockResolvedValueOnce({
      matchId: 'match-uuid-123',
      mySeat: 1,
      gameId: 'caro',
    });

    render(
      <OnlineLobby
        onBack={onBackMock}
        onRoomCreated={onRoomCreatedMock}
        onRoomJoined={onRoomJoinedMock}
      />,
    );

    const input = screen.getByTestId('room-code-input');
    fireEvent.change(input, { target: { value: 'ABC234' } });

    const joinBtn = screen.getByTestId('join-room-btn');
    fireEvent.click(joinBtn);

    await waitFor(() => {
      expect(roomRepository.joinRoom).toHaveBeenCalledWith('ABC234');
      expect(onRoomJoinedMock).toHaveBeenCalledWith('match-uuid-123', 1, 'caro', 'ABC234');
    });
  });

  it('5. Vào phòng thất bại (hết hạn) -> hiển thị thông báo lỗi thân thiện', async () => {
    vi.mocked(roomRepository.joinRoom).mockRejectedValueOnce({
      message: 'Phòng đấu đã hết hạn (quá 30 phút). Vui lòng tạo hoặc vào phòng khác.',
      code: 'ROOM_EXPIRED',
    });

    render(
      <OnlineLobby
        onBack={onBackMock}
        onRoomCreated={onRoomCreatedMock}
        onRoomJoined={onRoomJoinedMock}
      />,
    );

    const input = screen.getByTestId('room-code-input');
    fireEvent.change(input, { target: { value: 'ABC234' } });

    const joinBtn = screen.getByTestId('join-room-btn');
    fireEvent.click(joinBtn);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-error-msg').textContent).toContain(
        'Phòng đấu đã hết hạn (quá 30 phút)',
      );
    });
  });

  it('7. Truyền mode online_correspondence -> hiển thị tiêu đề và gọi createRoom với online_correspondence', async () => {
    vi.mocked(roomRepository.createRoom).mockResolvedValueOnce({
      code: 'CORR99',
      expiresAt: '2026-08-22T23:30:00Z',
    });

    render(
      <OnlineLobby
        mode="online_correspondence"
        onBack={onBackMock}
        onRoomCreated={onRoomCreatedMock}
        onRoomJoined={onRoomJoinedMock}
      />,
    );

    expect(screen.getByText(/Chơi Theo Lượt/i)).toBeDefined();

    const createBtn = screen.getByTestId('create-room-btn');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(roomRepository.createRoom).toHaveBeenCalledWith('caro', 'online_correspondence');
      expect(onRoomCreatedMock).toHaveBeenCalledWith('CORR99', '2026-08-22T23:30:00Z');
    });
  });
});
