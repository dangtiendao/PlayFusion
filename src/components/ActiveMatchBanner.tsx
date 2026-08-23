/**
 * ==============================================================================
 * ACTIVE MATCH BANNER COMPONENT (SRC/COMPONENTS/ACTIVEMATCHBANNER.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. PHÁT HIỆN TRẬN ĐANG SỐNG (P3.5b):
 *    - Tự động kiểm tra `matchRepository.getMyActiveMatch()` khi component mount
 *      hoặc khi ứng dụng chuyển sang trạng thái `visible`.
 *    - Tuyệt đối KHÔNG polling định kỳ bằng setInterval để tiết kiệm request DB.
 * 2. ĐIỀU HƯỚNG NHANH CHÓNG:
 *    - Cho phép người chơi bị thoát app / đóng tab quay trở lại đúng ván cờ đang đấu dở.
 * ==============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchRepository, type ActiveMatchInfo } from '@/repositories/matchRepository';

export const ActiveMatchBanner: React.FC = () => {
  const navigate = useNavigate();
  const [activeMatch, setActiveMatch] = useState<ActiveMatchInfo | null>(null);

  const checkActiveMatch = useCallback(async () => {
    try {
      const match = await matchRepository.getMyActiveMatch();
      setActiveMatch(match);
    } catch {
      setActiveMatch(null);
    }
  }, []);

  useEffect(() => {
    checkActiveMatch();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkActiveMatch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkActiveMatch]);

  if (!activeMatch) {
    return null;
  }

  const handleReturnToMatch = () => {
    navigate(`/game/${activeMatch.gameId}/online/${activeMatch.matchId}`);
  };

  return (
    <div
      data-testid="active-match-banner"
      className="w-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border-b border-amber-500/30 px-4 py-3 shadow-md backdrop-blur-sm transition-all"
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0 animate-bounce">⚔️</span>
          <div className="truncate">
            <p className="text-sm font-semibold text-amber-300 truncate">
              Bạn đang có trận đấu dở dang!
            </p>
            <p className="text-xs text-amber-200/80 truncate">
              Ván đấu trực tuyến vẫn đang diễn ra. Hãy quay lại ngay để không bị xử thua do hết giờ.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReturnToMatch}
          className="flex-shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer min-h-[44px]"
        >
          <span>Quay lại ngay</span>
          <span className="text-sm">→</span>
        </button>
      </div>
    </div>
  );
};

export default ActiveMatchBanner;
