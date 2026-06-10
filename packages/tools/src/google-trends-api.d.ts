declare module "google-trends-api" {
  export function interestOverTime(options: {
    keyword: string;
    geo?: string;
    startTime?: Date;
  }): Promise<string>;

  export function relatedQueries(options: {
    keyword: string;
    geo?: string;
    startTime?: Date;
  }): Promise<string>;

  export function dailyTrends(options: {
    geo?: string;
    trendDate?: Date;
  }): Promise<string>;
}
