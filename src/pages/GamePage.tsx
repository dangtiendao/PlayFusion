import React, { useMemo, useEffect, useState, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGameById } from '@/games/registry';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { GameShell } from '@/components/game-shell/GameShell';
import { useGameSessionStore } from '@/stores/gameSessionStore';
import { audioManager } from '@/core/audio';
import { hapticTap, hapticSuccess, hapticError } from '@/core/haptics';
import type { GameShellApi } from '@/games/types';
import type { MatchResultReport } from '@engines/types';

/**
 * ==============================================================================
 * TRANG CHỨA TRÒ CHƠI ĐỘNG (DYNAMIC GAME ROUTE CONTAINER: /game/:gameId)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & KỸ THUẬT:
 * 1. QUẢN LÝ VÒNG ĐỜI PHIÊN CHƠI (GAME SESSION LIFECYCLE):
 *    - Khi mount: gọi `enterGame()` đánh dấu người chơi vào trận (ẩn BottomNav).
 *    - Khi unmount hoặc người chơi xác nhận thoát: gọi `exitGame()` khôi phục trạng thái.
 * 2. KẾT NỐI GAMESHELL VỚI GAME VIEW:
 *    - GameShell cung cấp khung điều khiển (Toolbar, Pause Overlay, Back an toàn, Fullscreen).
 *    - GamePage khởi tạo `shellApi` và truyền các cờ điều khiển `isPaused`, `onGameEnd` vào View.
 * 3. CODE-SPLITTING LAZY LOADING:
 *    - Sử dụng `useMemo(() => React.lazy(entry.loadView), [entry])` để Component Factory ổn định
 *      không bị reset DOM ván cờ khi re-render.
 * ==============================================================================
 */

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  // Zustand Store
  const isPaused = useGameSessionStore((state) => state.isPaused);
  const enterGame = useGameSessionStore((state) => state.enterGame);
  const exitGame = useGameSessionStore((state) => state.exitGame);

  const [isGameCompleted, setIsGameCompleted] = useState<boolean>(false);

  // 1. Quản lý vòng đời phiên chơi
  useEffect(() => {
    enterGame();
    return () => {
      exitGame();
    };
  }, [enterGame, exitGame]);

  // 2. Tra cứu game từ Nguồn chân lý duy nhất (Registry)
  const entry = useMemo(() => (gameId ? getGameById(gameId) : undefined), [gameId]);

  // 3. Tạo Lazy Component ổn định qua useMemo
  const LazyGameView = useMemo(() => {
    if (!entry) return null;
    return React.lazy(entry.loadView);
  }, [entry]);

  // 4. Khởi tạo Shell API dùng chung cho View
  const shellApi = useMemo<GameShellApi>(
    () => ({
      playSfx: (key, opts) => audioManager.playSfx(key, opts),
      hapticTap: () => hapticTap(),
      hapticSuccess: () => hapticSuccess(),
      hapticError: () => hapticError(),
    }),
    [],
  );

  const handleExit = () => {
    exitGame();
    navigate('/');
  };

  const handleGameEnd = (report: MatchResultReport) => {
    setIsGameCompleted(true);
    console.log('[GamePage] Báo cáo kết quả ván đấu nhận từ Engine/View:', report);
  };

  // 5. Xử lý trường hợp không tìm thấy game (404)
  if (!entry || !LazyGameView) {
    return <NotFoundPage />;
  }

  const { definition } = entry;

  return (
    <div className="w-full max-w-2xl mx-auto pb-6">
      <GameShell
        definition={definition}
        onExit={handleExit}
        isGameCompleted={isGameCompleted}
        hasAutoSave={true}
      >
        <Suspense
          fallback={
            <div className="p-12 text-center">
              <LoadingSpinner message={`Đang nạp trò chơi ${definition.name}...`} />
            </div>
          }
        >
          <LazyGameView
            definition={definition}
            isPaused={isPaused}
            onGameEnd={handleGameEnd}
            shellApi={shellApi}
          />
        </Suspense>
      </GameShell>
    </div>
  );
}

export default GamePage;
