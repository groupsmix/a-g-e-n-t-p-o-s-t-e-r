declare module "google-trends-api" {
  export function interestOverTime(options: {
    keyword: string;
    geo?: string;
    startTime?: Date;
  }): Promise<string>;
}
