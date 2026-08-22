/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // =========================================================================
    // 1. RULE CẤM CIRCULAR DEPENDENCY TOÀN BỘ DỰ ÁN
    // =========================================================================
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'VI PHẠM KIẾN TRÚC: Cấm tuyệt đối circular dependency (phụ thuộc vòng tròn) ở mọi tầng trong toàn bộ dự án.',
      from: {},
      to: {
        circular: true,
      },
    },

    // =========================================================================
    // 2. LUẬT BẤT BIẾN: packages/engines KHÔNG ĐƯỢC PHỤ THUỘC VÀO src/
    // Lý do: Engine là pure TS độc lập 100%, phải chạy được trên Client, Worker AI, và Server Deno.
    // =========================================================================
    {
      name: 'engines-must-not-depend-on-src',
      severity: 'error',
      comment:
        'VI PHẠM KIẾN TRÚC: packages/engines là logic thuần túy, tuyệt đối KHÔNG ĐƯỢC import từ bất kỳ module nào trong src/.',
      from: {
        path: '^packages/engines',
      },
      to: {
        path: '^src',
      },
    },

    // =========================================================================
    // 3. LUẬT PHÂN TẦNG: src/core KHÔNG ĐƯỢC PHỤ THUỘC VÀO src/games HOẶC src/pages
    // Lý do: src/core là hạ tầng nền móng (GameShell, audio, storage), không được biết về game cụ thể hoặc view màn hình.
    // =========================================================================
    {
      name: 'core-must-not-depend-on-games-or-pages',
      severity: 'error',
      comment:
        'VI PHẠM KIẾN TRÚC: src/core là tầng hạ tầng lõi dùng chung, cấm import ngược từ tầng plugin game (src/games) hoặc tầng màn hình (src/pages).',
      from: {
        path: '^src/core',
      },
      to: {
        path: '^(src/games|src/pages)',
      },
    },

    // =========================================================================
    // 4. LUẬT PHÂN TẦNG: src/games KHÔNG ĐƯỢC PHỤ THUỘC VÀO src/pages
    // Lý do: Game plugin chỉ phụ thuộc engines, core, components; không được phụ thuộc vào trang route cụ thể.
    // =========================================================================
    {
      name: 'games-must-not-depend-on-pages',
      severity: 'error',
      comment:
        'VI PHẠM KIẾN TRÚC: src/games (game plugins) không được phép import từ src/pages (màn hình điều hướng).',
      from: {
        path: '^src/games',
      },
      to: {
        path: '^src/pages',
      },
    },

    // =========================================================================
    // 5. LUẬT PHÂN TẦNG: src/repositories VÀ src/transport KHÔNG ĐƯỢC PHỤ THUỘC VÀO src/games HOẶC src/pages
    // Lý do: Tầng dữ liệu DB và Realtime là service trung lập theo dimension game_id, không được dính coupling vào code view game hay màn hình.
    // =========================================================================
    {
      name: 'data-and-transport-must-not-depend-on-games-or-pages',
      severity: 'error',
      comment:
        'VI PHẠM KIẾN TRÚC: src/repositories và src/transport là tầng hạ tầng dữ liệu/realtime, cấm import từ src/games hoặc src/pages.',
      from: {
        path: '^(src/repositories|src/transport)',
      },
      to: {
        path: '^(src/games|src/pages)',
      },
    },

    // =========================================================================
    // 6. LUẬT CỔNG THOÁT HIỂM BACKEND: CHỈ src/repositories VÀ src/transport ĐƯỢC IMPORT SUPABASE
    // Lý do: Cấm mọi module ngoài src/repositories/ và src/transport/ import trực tiếp
    // @supabase/supabase-js hoặc src/repositories/supabaseClient.
    // - src/transport ĐƯỢC PHÉP import supabaseClient từ src/repositories/ để tái dùng
    //   Singleton client duy nhất (tránh tạo 2 client = 2 kết nối auth tốn tài nguyên + lệch session).
    // - Toàn bộ các tầng khác (pages, games, components, stores, core) TUYỆT ĐỐI CẤM import.
    // =========================================================================
    {
      name: 'only-repositories-and-transport-can-import-supabase',
      severity: 'error',
      comment:
        'VI PHẠM KIẾN TRÚC (CỔNG THOÁT HIỂM BACKEND): Cấm import @supabase/supabase-js hoặc supabaseClient ngoài thư mục src/repositories/ và src/transport/. Toàn bộ truy cập DB/Auth/Realtime phải bọc qua Repository hoặc Transport.',
      from: {
        path: '^(src/(?!repositories|transport)|packages)',
      },
      to: {
        path: '(@supabase/supabase-js|src/repositories/supabaseClient)',
      },
    },

    // =========================================================================
    // 7. LUẬT BẢO VỆ TẦNG TRANSPORT: CẤM IMPORT SÂU VÀO FILE NỘI BỘ TRONG src/transport
    // Lý do: Các tầng khác (pages, games, components, stores, core) chỉ được phép
    // import API công khai xuất khẩu từ src/transport/index.ts (hoặc alias '@/transport').
    // Cấm tuyệt đối import trực tiếp vào các file thực thi nội bộ (như matchChannel.ts).
    // =========================================================================
    {
      name: 'no-deep-transport-imports',
      severity: 'error',
      comment:
        'VI PHẠM KIẾN TRÚC: Cấm import sâu vào các file nội bộ trong src/transport/. Mọi module bên ngoài chỉ được import API công khai từ src/transport/index.ts hoặc src/transport.',
      from: {
        path: '^(src/(?!transport)|packages)',
      },
      to: {
        path: '^src/transport/(?!index(\\.ts)?$)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)',
      },
      archi: {
        collapsePattern: '^(packages/[^/]+|src/[^/]+)',
      },
    },
  },
};
