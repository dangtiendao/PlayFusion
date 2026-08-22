/**
 * ==============================================================================
 * ONLINE GAME PAGE PLACEHOLDER (SRC/PAGES/ONLINEGAMEPAGE.TSX)
 * ==============================================================================
 *
 * MÀN HÌNH PLACEHOLDER TRẬN ĐẤU ONLINE (/game/:gameId/online/:matchId - PHASE P3.3B):
 *
 * ⚠️ GHI CHÚ CHUYỂN TIẾP (TRANSITIONAL PLACEHOLDER):
 * - Phase P3.3b tập trung hoàn thiện luồng Tạo phòng, Nhập mã, Deep Link và Điều hướng.
 * - Màn hình này hiển thị xác nhận matchId và ghế (mySeat) đã được ghép thành công.
 * - [P3.3c THAY THẾ]: Màn hình trận đấu online chính thức tích hợp refereeRepository,
 *   useMatchChannel (Broadcast nước đi) và InteractiveBoard của từng Game Engine.
 * ==============================================================================
 */

import React from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

export const OnlineGamePage: React.FC = () => {
  const { gameId, matchId } = useParams<{ gameId: string; matchId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Đọc ghế (mySeat) từ state điều hướng, mặc định 0 nếu mở trực tiếp
  const mySeat = (location.state as { mySeat?: number })?.mySeat ?? 0;
  const roomCode = (location.state as { roomCode?: string })?.roomCode;

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

        {/* Bảng thông tin trận đấu placeholder */}
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

        {/* Ghi chú lộ trình P3.3c */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs text-left space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <span>🚧</span>
            <span>Màn hình chuyển tiếp (Phase P3.3b)</span>
          </div>
          <p className="opacity-90 leading-relaxed">
            Hạ tầng tạo phòng, vào phòng, chia ghế 50/50 và deep link đã hoàn tất. Phase P3.3c sẽ
            gắn Trọng tài Server-side (referee) và bàn cờ trực tiếp vào màn hình này!
          </p>
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
