// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TransportDemo from '@/pages/dev/TransportDemo';
import * as transportModule from '@/transport';

describe('TransportDemo Component Tests (src/pages/dev/TransportDemo.tsx - P3.1c)', () => {
  const mockSend = vi.fn().mockResolvedValue(undefined);
  const mockReconnect = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSend.mockClear();
    mockReconnect.mockClear();

    vi.spyOn(transportModule, 'useMatchChannel').mockImplementation((options) => {
      const isConnected = Boolean(options.enabled && options.matchId);
      return {
        status: isConnected ? 'connected' : 'idle',
        members: isConnected
          ? [
              {
                userId: 'user-01',
                displayName: 'Player One',
                joinedAt: '2026-08-22T10:00:00.000Z',
              },
            ]
          : [],
        send: mockSend,
        reconnect: mockReconnect,
      };
    });
  });

  const renderComponent = () =>
    render(
      <MemoryRouter>
        <TransportDemo />
      </MemoryRouter>,
    );

  it('1. Render thành công giao diện chẩn đoán transport demo', () => {
    renderComponent();

    expect(screen.getByText(/Chẩn Đoán Realtime Transport/i)).toBeDefined();
    expect(screen.getByPlaceholderText('VD: DEMO01')).toBeDefined();
    expect(screen.getByRole('button', { name: /Vào kênh/i })).toBeDefined();
    expect(screen.getByText(/Chưa vào kênh/i)).toBeDefined();
  });

  it('2. Nhập mã kênh không hợp lệ (dưới 6 ký tự hoặc ký tự lạ) hiển thị thông báo lỗi', async () => {
    renderComponent();

    const input = screen.getByPlaceholderText('VD: DEMO01');
    fireEvent.change(input, { target: { value: 'AB' } });

    const joinBtn = screen.getByRole('button', { name: /Vào kênh/i });
    fireEvent.click(joinBtn);

    expect(screen.getByText(/Mã phòng phải gồm đúng 6 ký tự chữ in hoa hoặc số/i)).toBeDefined();
  });

  it('3. Nhập mã kênh 6 ký tự hợp lệ và bấm "Vào kênh" -> kích hoạt kết nối và chuyển sang nút "Rời kênh"', () => {
    renderComponent();

    const input = screen.getByPlaceholderText('VD: DEMO01');
    fireEvent.change(input, { target: { value: 'ROOM99' } });

    const joinBtn = screen.getByRole('button', { name: /Vào kênh/i });
    fireEvent.click(joinBtn);

    expect(screen.getByRole('button', { name: /Rời kênh/i })).toBeDefined();
    expect(screen.getByText('match:ROOM99')).toBeDefined();
    expect(screen.getByText(/Player One/i)).toBeDefined();
  });

  it('4. Khi đã kết nối, bấm "Gửi Broadcast Ping" gọi hàm send() với type ping', async () => {
    renderComponent();

    // Vào kênh
    const joinBtn = screen.getByRole('button', { name: /Vào kênh/i });
    fireEvent.click(joinBtn);

    const pingBtn = screen.getByRole('button', { name: /Gửi Broadcast Ping/i });
    expect(pingBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(pingBtn);
    });

    expect(mockSend).toHaveBeenCalledWith('ping', { n: 1 });
    expect(screen.getByText('1', { selector: 'strong' })).toBeDefined();
    expect(screen.getByText(/lượt ping/i)).toBeDefined();
  });

  it('5. Bấm "Rời kênh" chuyển trạng thái về chưa vào kênh', () => {
    renderComponent();

    // Vào kênh
    fireEvent.click(screen.getByRole('button', { name: /Vào kênh/i }));
    expect(screen.getByRole('button', { name: /Rời kênh/i })).toBeDefined();

    // Rời kênh
    fireEvent.click(screen.getByRole('button', { name: /Rời kênh/i }));
    expect(screen.getByRole('button', { name: /Vào kênh/i })).toBeDefined();
    expect(screen.getByText(/Chưa vào kênh/i)).toBeDefined();
  });
});
