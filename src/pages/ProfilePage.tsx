export function ProfilePage() {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <section className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <span>👤 Thông Tin Người Chơi</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Hồ Sơ Cá Nhân
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
          Xem thông tin tài khoản, ví xu và lịch sử đấu đối kháng.
        </p>
      </section>

      {/* Placeholder Thẻ Hồ sơ */}
      <section className="bg-surface dark:bg-surface-dark rounded-xl border border-surface-border dark:border-surface-dark-border p-6 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-2xl font-bold">
          🎮
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Khách chơi (Guest)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tính năng đăng nhập Supabase Auth & Hồ sơ cá nhân sẽ được tích hợp ở Phase P2.1.
          </p>
        </div>
      </section>
    </div>
  );
}

export default ProfilePage;
