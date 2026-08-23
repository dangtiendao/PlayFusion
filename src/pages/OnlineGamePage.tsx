/**
 * ==============================================================================
 * ONLINE GAME PAGE ROUTER (SRC/PAGES/ONLINEGAMEPAGE.TSX)
 * ==============================================================================
 *
 * MÀN HÌNH ĐIỀU HƯỚNG TRẬN ĐẤU ONLINE (/game/:gameId/online/:matchId - PHASE P3.3C):
 *
 * 1. Với game cờ Caro (`gameId === 'caro'`):
 *    - Mount màn hình ván đấu online chính thức `OnlineMatchScreen` tích hợp Referee
 *      và Realtime Transport.
 * 2. Với các game khác (chưa mở Online ở các Phase sau):
 *    - Hiển thị màn hình chờ chuyển tiếp.
 * ==============================================================================
 */

import React from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { OnlineMatchScreen } from '@/games/caro/OnlineMatchScreen';

export const OnlineGamePage: React.FC = () => {
  const { gameId, matchId } = useParams<{ gameId: string; matchId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Đọc ghế (mySeat) và mã phòng từ state điều hướng
  const mySeat = (location.state as { mySeat?: number })?.mySeat ?? 0;
  const roomCode = (location.state as { roomCode?: string })?.roomCode;

  // Nếu là Game cờ Caro -> Render màn hình ván đấu online thật (P3.3c)
  if (gameId === 'caro') {
    return <OnlineMatchScreen matchId={matchId} mySeat={mySeat} roomCode={roomCode} />;
  }

  // Placeholder cho các game khác
  return (
    <div
      data-testid="online-game-placeholder"
      className="flex flex-col items-center justify-center min-h-[70vh] p-4 max-w-md mx-auto animate-fade-in text-center space-y-6"
    >
      <div className="w-full p-6 rounded-3xl bg-gradient-to-b from-cyan-500/10 via-slate-100 to-slate-200 dark:from-cyan-950/30 dark:via-slate-800 dark:to-slate-900 border border-cyan-500/30 shadow-2xl space-y-5">
        <div className="space-y-1">
          <div className="text-4xl">⚔️</div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Trận Đấu Trực Tuyến 1v1
          </h2>
          <p className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold">
            Đã ghép phòng thành công!
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 space-y-3 text-left">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">Trò chơi:</span>
            <div
              data-testid="online-game-id"
              className="text-sm font-black text-slate-900 dark:text-white uppercase"
            >
              {gameId}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Mã trận đấu (Match ID):
            </span>
            <div
              data-testid="online-match-id"
              className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 break-all"
            >
              {matchId}
            </div>
          </div>

          {roomCode && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Phòng đấu:</span>
              <div className="text-sm font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {roomCode}
              </div>
            </div>
          )}

          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Vị trí ghế của bạn:
            </span>
            <div
              data-testid="online-my-seat"
              className="text-sm font-bold text-emerald-600 dark:text-emerald-400"
            >
              {mySeat === 0 ? 'Ghế 0 (Quân X — Đi trước)' : 'Ghế 1 (Quân O — Đi sau)'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md active:scale-95 transition-all"
        >
          Quay về Trang chủ
        </button>
      </div>
    </div>
  );
};

export default OnlineGamePage;
