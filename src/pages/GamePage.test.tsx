// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GamePage } from './GamePage';
import { dummyManifest } from '@engines/dummy/manifest';
import { dummy2Manifest } from '@engines/dummy2/manifest';

describe('GamePage Dynamic Route Tests (src/pages/GamePage.tsx)', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Render thành công game hợp lệ (/game/dummy) trong GameShell', async () => {
    render(
      <MemoryRouter initialEntries={['/game/dummy']}>
        <Routes>
          <Route path="/game/:gameId" element={<GamePage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Xác nhận nút Back và Header GameShell hiển thị
    expect(screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i })).toBeDefined();
    expect(screen.getByText(dummyManifest.name)).toBeDefined();
  });

  it('2. Render thành công game giả thứ hai (/game/dummy2) trong GameShell', async () => {
    render(
      <MemoryRouter initialEntries={['/game/dummy2']}>
        <Routes>
          <Route path="/game/:gameId" element={<GamePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i })).toBeDefined();
    expect(screen.getByText(dummy2Manifest.name)).toBeDefined();
  });

  it('3. Hiển thị NotFoundPage khi truy cập ID game không tồn tại (/game/non_existent_game)', () => {
    render(
      <MemoryRouter initialEntries={['/game/non_existent_game']}>
        <Routes>
          <Route path="/game/:gameId" element={<GamePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/404/i)).toBeDefined();
    expect(screen.getByText(/Không tìm thấy trang/i)).toBeDefined();
  });
});
