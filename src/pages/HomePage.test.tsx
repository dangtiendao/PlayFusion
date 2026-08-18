// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { getAllGames } from '@/games/registry';

describe('HomePage Dynamic Game Hub Tests (src/pages/HomePage.tsx)', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  const renderHomePage = () => {
    return render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
  };

  it('1. Render đầy đủ các thẻ game từ Registry', () => {
    renderHomePage();
    const games = getAllGames();

    // Xác nhận số lượng card hoặc tên game hiển thị đúng
    for (const game of games) {
      expect(screen.getByText(game.definition.name)).toBeDefined();
    }
  });

  it('2. Tìm kiếm trò chơi có dấu hoặc không dấu', () => {
    renderHomePage();
    const searchInput = screen.getByRole('textbox', { name: /Tìm kiếm trò chơi/i });

    // Tìm bằng từ khóa tiếng Việt không dấu 'co caro' (khớp với 'Cờ Caro')
    fireEvent.change(searchInput, { target: { value: 'co caro' } });
    expect(screen.getByText('Cờ Caro')).toBeDefined();

    // Tìm bằng từ khóa tiếng Việt không dấu 'kiem chung' (khớp với mô tả của dummy game)
    fireEvent.change(searchInput, { target: { value: 'kiem chung' } });
    expect(screen.getByText('Dummy Test Game')).toBeDefined();
  });

  it('3. Hiển thị Empty State khi tìm kiếm không có kết quả', () => {
    renderHomePage();
    const searchInput = screen.getByRole('textbox', { name: /Tìm kiếm trò chơi/i });

    // Tìm từ khóa không tồn tại
    fireEvent.change(searchInput, { target: { value: 'game_khong_ton_tai_12345' } });

    expect(screen.getByText(/Không tìm thấy trò chơi nào/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Xóa bộ lọc & Hiển thị tất cả/i })).toBeDefined();

    // Bấm nút xóa bộ lọc -> Khôi phục danh sách
    const clearBtn = screen.getByRole('button', { name: /Xóa bộ lọc & Hiển thị tất cả/i });
    fireEvent.click(clearBtn);
    expect(screen.getByText('Cờ Caro')).toBeDefined();
  });

  it('4. Lọc theo Category Chips', () => {
    renderHomePage();

    // Bấm chọn tab 'Giải đố' (Puzzle)
    const puzzleTab = screen.getByRole('tab', { name: /Giải đố/i });
    fireEvent.click(puzzleTab);

    // Chỉ hiển thị dummy2 (Puzzle), không hiển thị game Board
    expect(screen.getByText('Dummy 2 Puzzle')).toBeDefined();
    expect(screen.queryByText('Cờ Caro')).toBeNull();

    // Bấm 'Tất cả' -> Hiển thị lại toàn bộ
    const allTab = screen.getByRole('tab', { name: /Tất cả/i });
    fireEvent.click(allTab);
    expect(screen.getByText('Cờ Caro')).toBeDefined();
    expect(screen.getByText('Dummy 2 Puzzle')).toBeDefined();
  });
});
