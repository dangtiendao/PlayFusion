// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModeSelect } from './ModeSelect';
import { caroManifest } from '@engines/caro/manifest';
import type { GameDefinition } from '@engines/types';
import type { GameShellApi } from '../../types';

describe('Caro ModeSelect Component (ModeSelect.tsx - P1.4a)', () => {
  let mockShellApi: GameShellApi;
  let mockOnStart: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShellApi = {
      playSfx: vi.fn(),
      hapticTap: vi.fn(),
      hapticSuccess: vi.fn(),
      hapticError: vi.fn(),
    };
    mockOnStart = vi.fn();
  });

  it('1. Render đầy đủ các chế độ và cấp độ AI từ caroManifest', () => {
    render(<ModeSelect definition={caroManifest} onStart={mockOnStart} shellApi={mockShellApi} />);

    expect(screen.getByTestId('caro-mode-select')).not.toBeNull();
    expect(screen.getByText(caroManifest.name)).not.toBeNull();

    // Hiển thị cả 2 mode
    expect(screen.getByTestId('mode-btn-vs_ai')).not.toBeNull();
    expect(screen.getByTestId('mode-btn-local_pvp')).not.toBeNull();

    // Hiển thị 3 nút cấp độ AI
    expect(screen.getByTestId('ai-level-btn-easy')).not.toBeNull();
    expect(screen.getByTestId('ai-level-btn-medium')).not.toBeNull();
    expect(screen.getByTestId('ai-level-btn-hard')).not.toBeNull();

    // Hiển thị 2 nút chọn phe
    expect(screen.getByTestId('seat-x-btn')).not.toBeNull();
    expect(screen.getByTestId('seat-o-btn')).not.toBeNull();
  });

  it('2. Chứng minh Render từ Manifest: Khi manifest giả không có vs_ai thì KHÔNG hiện nút đấu máy', () => {
    const mockPvpOnlyManifest: GameDefinition = {
      ...caroManifest,
      id: 'mock_pvp_only',
      modes: ['local_pvp'],
    };

    render(
      <ModeSelect definition={mockPvpOnlyManifest} onStart={mockOnStart} shellApi={mockShellApi} />,
    );

    expect(screen.getByTestId('mode-btn-local_pvp')).not.toBeNull();
    expect(screen.queryByTestId('mode-btn-vs_ai')).toBeNull();
    expect(screen.queryByTestId('vs-ai-config-panel')).toBeNull();
  });

  it('3. Luồng chọn "2 người 1 máy": Bắt đầu ván đấu ngay với config local_pvp', () => {
    render(<ModeSelect definition={caroManifest} onStart={mockOnStart} shellApi={mockShellApi} />);

    const pvpBtn = screen.getByTestId('mode-btn-local_pvp');
    act(() => {
      fireEvent.click(pvpBtn);
    });

    expect(mockShellApi.playSfx).toHaveBeenCalledWith('click');
    expect(mockShellApi.hapticTap).toHaveBeenCalled();
    expect(mockOnStart).toHaveBeenCalledWith({
      mode: 'local_pvp',
    });
  });

  it('4. Luồng chọn "Đấu máy": Chọn độ khó Khó + Đi sau (Quân O) -> Khởi động đúng config', () => {
    render(<ModeSelect definition={caroManifest} onStart={mockOnStart} shellApi={mockShellApi} />);

    // 1. Bấm chọn cấp độ "Khó"
    const hardBtn = screen.getByTestId('ai-level-btn-hard');
    act(() => {
      fireEvent.click(hardBtn);
    });

    // 2. Bấm chọn đi sau: Quân O (humanSeat = 1)
    const seatOBtn = screen.getByTestId('seat-o-btn');
    act(() => {
      fireEvent.click(seatOBtn);
    });

    // 3. Bấm nút Bắt đầu đấu máy
    const startBtn = screen.getByTestId('start-vs-ai-btn');
    act(() => {
      fireEvent.click(startBtn);
    });

    expect(mockShellApi.playSfx).toHaveBeenCalledWith('click');
    expect(mockShellApi.hapticTap).toHaveBeenCalled();
    expect(mockOnStart).toHaveBeenCalledWith({
      mode: 'vs_ai',
      aiLevel: 'hard',
      humanSeat: 1,
    });
  });
});
