export interface AppConfig {
  readonly name: string;
  readonly version: string;
  readonly description: string;
}

export const APP_CONFIG: AppConfig = {
  name: 'PlayFusion',
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.5.0',
  description: 'Nền tảng Web Game Hub chơi cờ và board games đối kháng trực tuyến & offline',
};
