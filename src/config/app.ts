export interface AppConfig {
  readonly name: string;
  readonly version: string;
  readonly description: string;
}

export const APP_CONFIG: AppConfig = {
  name: 'Web Game Hub',
  version: '0.1.0',
  description: 'Nền tảng Web Game Hub đa trò chơi',
};
