// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { GameShell } from './GameShell';
import { dummyManifest } from '@engines/dummy/manifest';
import { useGameSessionStore } from '@/stores/gameSessionStore';
import { useSettingsStore } from '@/stores/settingsStore';

describe('GameShell Component Tests (src/components/game-shell/GameShell.tsx)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useGameSessionStore.getState().exitGame();
    useSettingsStore.getState().resetSettings();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. Render Toolbar đầy đủ: tên game, nút Back, Mute, Pause', () => {
    render(
      <GameShell definition={dummyManifest} onExit={vi.fn()}>
        <div>Game Canvas Content</div>
      </GameShell>,
    );

    expect(screen.getByText(dummyManifest.name)).toBeDefined();
    expect(screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Tắt âm thanh/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Tạm dừng ván đấu/i })).toBeDefined();
    expect(screen.getByText('Game Canvas Content')).toBeDefined();
  });

  it('2. Bật/Tắt Pause: Hiển thị Pause Overlay và Resume ván đấu', () => {
    render(
      <GameShell definition={dummyManifest} onExit={vi.fn()}>
        <div>Game Content</div>
      </GameShell>,
    );

    const pauseBtn = screen.getByRole('button', { name: /Tạm dừng ván đấu/i });
    fireEvent.click(pauseBtn);

    // Xác nhận Pause Overlay hiển thị
    const pauseDialog = screen.getByRole('dialog', { name: /Ván đấu đang tạm dừng/i });
    expect(pauseDialog).toBeDefined();

    // Bấm Tiếp tục trong Pause Overlay
    const resumeBtn = within(pauseDialog).getByRole('button', { name: /Tiếp tục ván đấu/i });
    fireEvent.click(resumeBtn);

    expect(screen.queryByRole('dialog', { name: /Ván đấu đang tạm dừng/i })).toBeNull();
  });

  it('3. Back an toàn: Bấm Back giữa ván đấu chưa hoàn thành -> Hiện ConfirmDialog', () => {
    const onExitMock = vi.fn();
    render(
      <GameShell definition={dummyManifest} onExit={onExitMock} isGameCompleted={false}>
        <div>Game Content</div>
      </GameShell>,
    );

    const backBtn = screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i });
    fireEvent.click(backBtn);

    // Xác nhận Confirm Dialog xuất hiện và CHƯA gọi onExit
    expect(screen.getByText('Xác nhận rời trận đấu?')).toBeDefined();
    expect(
      screen.getByText(
        'Tiến trình ván đấu hiện tại chưa hoàn thành và sẽ bị hủy bỏ nếu bạn rời đi.',
      ),
    ).toBeDefined();
    expect(onExitMock).not.toHaveBeenCalled();

    // Bấm "Ở lại chơi tiếp"
    const cancelBtn = screen.getByRole('button', { name: /Ở lại chơi tiếp/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('Xác nhận rời trận đấu?')).toBeNull();
    expect(onExitMock).not.toHaveBeenCalled();

    // Bấm lại Back và xác nhận "Rời trận"
    fireEvent.click(backBtn);
    const confirmExitBtn = screen.getByRole('button', { name: /Rời trận/i });
    fireEvent.click(confirmExitBtn);

    expect(onExitMock).toHaveBeenCalledTimes(1);
  });

  it('4. Thoát trực tiếp khi ván đấu đã hoàn thành (isGameCompleted = true)', () => {
    const onExitMock = vi.fn();
    render(
      <GameShell definition={dummyManifest} onExit={onExitMock} isGameCompleted={true}>
        <div>Game Content</div>
      </GameShell>,
    );

    const backBtn = screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i });
    fireEvent.click(backBtn);

    // Thoát ngay không cần hỏi lại
    expect(screen.queryByText('Xác nhận rời trận đấu?')).toBeNull();
    expect(onExitMock).toHaveBeenCalledTimes(1);
  });

  it('5. Phím tắt ESC: Kích hoạt Pause hoặc đóng modal xác nhận', () => {
    render(
      <GameShell definition={dummyManifest} onExit={vi.fn()}>
        <div>Game Content</div>
      </GameShell>,
    );

    // Nhấn Escape lần 1 -> Bật Pause
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(useGameSessionStore.getState().isPaused).toBe(true);

    // Nhấn Escape lần 2 -> Tắt Pause (Resume)
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(useGameSessionStore.getState().isPaused).toBe(false);
  });

  it('6. Hiển thị thông điệp có auto-save khi hasAutoSave = true trong ConfirmDialog (P1.5b)', () => {
    render(
      <GameShell definition={dummyManifest} onExit={vi.fn()} hasAutoSave={true}>
        <div>Game Content</div>
      </GameShell>,
    );

    const backBtn = screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i });
    fireEvent.click(backBtn);

    expect(
      screen.getByText('Thoát trận? Ván đang chơi đã được lưu, bạn có thể tiếp tục sau.'),
    ).toBeDefined();
  });
});
