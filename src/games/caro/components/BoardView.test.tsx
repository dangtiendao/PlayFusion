// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoardView } from './BoardView';

describe('Caro BoardView Component (BoardView.tsx - P1.3a)', () => {
  it('render chính xác số lượng ô cờ theo boardSize (15x15 = 225 ô)', () => {
    const board = Array(225).fill(-1);
    render(
      <BoardView board={board} boardSize={15} lastMove={null} winLine={null} cellSizePx={32} />,
    );

    const grid = screen.getByTestId('caro-board-grid');
    expect(grid).not.toBeNull();

    const cells = screen.getAllByRole('button');
    expect(cells).toHaveLength(225);
  });

  it('vẽ chính xác quân X và quân O tại đúng vị trí index trong mảng board', () => {
    const board = Array(25).fill(-1);
    board[0] = 0; // X tại ô (0,0)
    board[12] = 1; // O tại ô (2,2)
    board[24] = 0; // X tại ô (4,4)

    render(
      <BoardView board={board} boardSize={5} lastMove={null} winLine={null} cellSizePx={36} />,
    );

    const cell0 = screen.getByTestId('caro-cell-0');
    const cell12 = screen.getByTestId('caro-cell-12');
    const cell24 = screen.getByTestId('caro-cell-24');
    const cell1 = screen.getByTestId('caro-cell-1');

    expect(cell0.getAttribute('data-value')).toBe('0');
    expect(cell12.getAttribute('data-value')).toBe('1');
    expect(cell24.getAttribute('data-value')).toBe('0');
    expect(cell1.getAttribute('data-value')).toBe('-1');

    // Kiểm tra có chứa SVG vector quân cờ
    expect(cell0.querySelector('svg')).not.toBeNull();
    expect(cell12.querySelector('svg')).not.toBeNull();
    expect(cell1.querySelector('svg')).toBeNull();
  });

  it('gắn đúng cờ highlight data-last-move và marker cho nước đi cuối cùng', () => {
    const board = Array(25).fill(-1);
    board[7] = 0;

    render(<BoardView board={board} boardSize={5} lastMove={7} winLine={null} cellSizePx={32} />);

    const cell7 = screen.getByTestId('caro-cell-7');
    expect(cell7.getAttribute('data-last-move')).toBe('true');
    expect(cell7.querySelector('[data-testid="last-move-marker"]')).not.toBeNull();

    const cell0 = screen.getByTestId('caro-cell-0');
    expect(cell0.getAttribute('data-last-move')).toBeNull();
  });

  it('gắn đúng cờ highlight data-win-line cho các ô thuộc chuỗi thắng cuộc', () => {
    const board = Array(25).fill(-1);
    const winLine = [5, 6, 7, 8, 9];
    for (const idx of winLine) {
      board[idx] = 0;
    }

    render(
      <BoardView board={board} boardSize={5} lastMove={9} winLine={winLine} cellSizePx={32} />,
    );

    for (const idx of winLine) {
      const cell = screen.getByTestId(`caro-cell-${idx}`);
      expect(cell.getAttribute('data-win-line')).toBe('true');
    }

    const cell0 = screen.getByTestId('caro-cell-0');
    expect(cell0.getAttribute('data-win-line')).toBeNull();
  });

  it('gắn đúng cờ data-preview và hiển thị quân mờ khi có previewCell', () => {
    const board = Array(25).fill(-1);

    render(
      <BoardView
        board={board}
        boardSize={5}
        lastMove={null}
        winLine={null}
        previewCell={12}
        previewPlayer={0}
        cellSizePx={32}
      />,
    );

    const cell12 = screen.getByTestId('caro-cell-12');
    expect(cell12.getAttribute('data-preview')).toBe('true');
    expect(cell12.querySelector('svg')).not.toBeNull();
  });

  it('kích hoạt onCellPointerDown với index chính xác khi người chơi chạm/click vào ô', () => {
    const onPointerDown = vi.fn();
    const board = Array(25).fill(-1);

    render(
      <BoardView
        board={board}
        boardSize={5}
        lastMove={null}
        winLine={null}
        cellSizePx={32}
        onCellPointerDown={onPointerDown}
      />,
    );

    const cell8 = screen.getByTestId('caro-cell-8');
    fireEvent.pointerDown(cell8);

    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onPointerDown.mock.calls[0]?.[0]).toBe(8);
  });

  it('tối ưu re-render: khi cập nhật 1 ô trong board, các ô khác giữ nguyên trạng thái DOM', () => {
    const board1 = Array(9).fill(-1);
    const { rerender } = render(
      <BoardView board={board1} boardSize={3} lastMove={null} winLine={null} cellSizePx={32} />,
    );

    const initialCell0 = screen.getByTestId('caro-cell-0');
    const initialCell1 = screen.getByTestId('caro-cell-1');
    expect(initialCell0.getAttribute('data-value')).toBe('-1');

    // Cập nhật ô số 0 thành quân X
    const board2 = [...board1];
    board2[0] = 0;

    rerender(
      <BoardView board={board2} boardSize={3} lastMove={0} winLine={null} cellSizePx={32} />,
    );

    const updatedCell0 = screen.getByTestId('caro-cell-0');
    const unchangedCell1 = screen.getByTestId('caro-cell-1');

    expect(updatedCell0.getAttribute('data-value')).toBe('0');
    expect(updatedCell0.getAttribute('data-last-move')).toBe('true');
    expect(unchangedCell1.getAttribute('data-value')).toBe('-1');
    expect(unchangedCell1).toBe(initialCell1); // Cùng tham chiếu DOM node do React.memo
  });
});
